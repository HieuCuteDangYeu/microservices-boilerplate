import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/conversation-client';
import Redis from 'ioredis';

// Entities & Interfaces
import {
  ChatParticipant,
  Conversation,
} from '../../domain/entities/conversation.entity';
import {
  Message,
  type MessageReactionMap,
  type MessageReplyPreview,
  type RecallMessageResult,
} from '../../domain/entities/message.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

// Mappers
import { ReadStatus } from 'apps/conversation-service/src/domain/entities/read-status.entity';
import type { IEncryptionRepository } from 'apps/conversation-service/src/domain/interfaces/encryption.repository.interface';
import type { IUserService } from 'apps/conversation-service/src/domain/interfaces/user-service.interface';
import { ChatMapper } from './chat.mapper';
import { ConversationMapper } from './conversation.mapper';

interface CachedReadStatus {
  userId: string;
  at: string;
}

interface CachedMessage {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId?: string;
  type: string;
  signalType: number;
  content: string;
  createdAt: string;
  isRecalled?: boolean;
  recalledAt?: string;
  replyToId?: string;
  replyPreview?: MessageReplyPreview;
  readBy?: CachedReadStatus[];
  reactions?: MessageReactionMap;
}

const RECALLED_PREVIEW_CONTENT = 'Tin nhắn đã thu hồi';
const RECALLED_LAST_MESSAGE = '🚫 Message recalled';
const RECALL_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PrismaChatRepository implements IChatRepository {
  private readonly logger = new Logger(PrismaChatRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,

    // 👇 INJECT QUA INTERFACE TOKEN
    @Inject('IEncryptionRepository')
    private readonly encryptionRepository: IEncryptionRepository,

    @Inject('IUserService')
    private readonly userService: IUserService,
  ) {}

  // --- 1. CREATE MESSAGE ---
  async createMessage(message: Message): Promise<Message> {
    await this.assertConversationParticipant(
      message.conversationId,
      message.senderId,
    );

    if (message.clientMessageId) {
      const existingMessage = await this.prisma.message.findFirst({
        where: {
          conversationId: message.conversationId,
          senderId: message.senderId,
          clientMessageId: message.clientMessageId,
        },
      });

      if (existingMessage) {
        const domainMessage = ChatMapper.toDomain(existingMessage);
        if (domainMessage.signalType === 0) {
          domainMessage.content = this.encryptionRepository.decrypt(
            domainMessage.content,
          );
        }

        return domainMessage;
      }
    }

    // BƯỚC 1: Chuẩn bị dữ liệu (CPU bound - cực nhanh)
    let contentToSave = message.content;
    const replyPreview = await this.buildReplyPreview(
      message.replyToId,
      message.conversationId,
    );

    // Logic mã hóa
    if (message.signalType === 0) {
      contentToSave = this.encryptionRepository.encrypt(message.content);
    }

    // Tính toán Preview Text NGAY LẬP TỨC (để dùng cho transaction)
    let previewText = '';
    if (message.type === 'text') {
      if (message.signalType === 0) {
        previewText = message.content; // Normal: Server thấy text
      } else {
        previewText = '🔒 Tin nhắn được bảo mật'; // Signal: Server mù
      }
    } else {
      // Map loại file sang text hiển thị
      const typeMap: Record<string, string> = {
        image: '[Hình ảnh]',
        video: '[Video]',
        file: '[Tập tin]',
        call: '📞 Cuộc gọi',
      };
      previewText = typeMap[message.type] || 'Tin nhắn mới';
    }

    // BƯỚC 2: Thực thi DB song song (Prisma Transaction)
    // Giúp giảm Round-trip time xuống DB từ 2 lần còn 1 lần
    const [savedMsg] = await this.prisma.$transaction([
      // Op 1: Tạo message
      this.prisma.message.create({
        data: {
          type: message.type,
          clientMessageId: message.clientMessageId,
          signalType: message.signalType ?? 1,
          content: contentToSave,
          registrationId: message.registrationId,
          senderId: message.senderId,
          isRecalled: false,
          replyToId: message.replyToId,
          replyPreview: replyPreview
            ? (replyPreview as unknown as Prisma.InputJsonValue)
            : null,
          conversationId: message.conversationId,
          readBy: [],
        },
      }),
      // Op 2: Update conversation (Last message)
      this.prisma.conversation.update({
        where: { id: message.conversationId },
        data: {
          lastMessage: previewText,
          lastMessageAt: new Date(),
        },
      }),
    ]);

    // BƯỚC 3: Map về Domain Model
    const domainMsg = ChatMapper.toDomain(savedMsg);
    // Nếu là normal mode, trả về content gốc cho người gửi (đỡ phải decrypt lại)
    if (message.signalType === 0) {
      domainMsg.content = message.content;
    }

    // BƯỚC 4: Cập nhật Redis dạng "Fire-and-Forget"
    // KHÔNG dùng await ở đây. Để nó chạy ngầm, lỗi thì log lại sau.
    // User nhận phản hồi ngay lập tức sau Bước 3.
    this.updateRedisInBackground(domainMsg).catch((err: unknown) => {
      const error = err as Error;
      this.logger.error(
        `Failed to update cache for msg ${domainMsg.id}`,
        error.stack,
      );
    });

    return domainMsg;
  }

  private async updateRedisInBackground(domainMsg: Message) {
    const redisKey = `chat:history:${domainMsg.conversationId}`;

    const pipeline = this.redis.pipeline();

    pipeline.lpush(redisKey, JSON.stringify(ChatMapper.toDto(domainMsg)));
    pipeline.ltrim(redisKey, 0, 49);
    pipeline.expire(redisKey, 60 * 60 * 24 * 7);

    await pipeline.exec();
  }

  // --- 2. FIND MESSAGES ---
  async findMessagesByConversationId(
    conversationId: string,
    limit: number = 20,
    cursor?: string,
  ): Promise<Message[]> {
    const redisKey = `chat:history:${conversationId}`;

    // CASE 1: Lấy trang đầu tiên (Không có cursor) -> Ưu tiên Redis
    if (!cursor) {
      const cached = await this.redis.lrange(redisKey, 0, limit - 1);

      if (cached.length > 0) {
        return cached
          .map((item) => {
            const plain = JSON.parse(item) as CachedMessage;
            return new Message({
              id: plain.id,
              conversationId: plain.conversationId,
              senderId: plain.senderId,
              clientMessageId: plain.clientMessageId,
              type: plain.type,
              signalType: plain.signalType,
              content: plain.content,
              createdAt: new Date(plain.createdAt),
              isRecalled: plain.isRecalled,
              recalledAt: plain.recalledAt
                ? new Date(plain.recalledAt)
                : undefined,
              replyToId: plain.replyToId,
              replyPreview: this.normalizeReplyPreview(plain.replyPreview),
              reactions: this.normalizeReactions(plain.reactions),

              // 👇 SỬA LỖI TẠI ĐÂY
              readBy: (plain.readBy || []).map(
                (
                  s, // Tham số bạn đặt tên là 's'
                ) =>
                  new ReadStatus({
                    userId: s.userId,
                    at: new Date(s.at), // 👈 SỬA: Thay 'status.at' thành 's.at'
                  }),
              ),
            });
          })
          .reverse();
      }
    }

    // CASE 2: Redis Miss HOẶC Load History (Có cursor) -> Query MongoDB
    // Prisma Cursor Pagination logic
    const mongoMsgs = await this.prisma.message.findMany({
      where: { conversationId },
      take: limit,
      skip: cursor ? 1 : 0, // Nếu có cursor, bỏ qua chính nó
      cursor: cursor ? { id: cursor } : undefined, // Nhảy tới vị trí con trỏ
      orderBy: { createdAt: 'desc' }, // Lấy từ mới nhất đổ về cũ nhất
    });

    const domainMsgs = mongoMsgs.map((msg) => {
      const domain = ChatMapper.toDomain(msg);
      // Decrypt logic cho Normal Mode
      if (domain.signalType === 0) {
        domain.content = this.encryptionRepository.decrypt(domain.content);
      }
      return domain;
    });

    // Hydrate Cache: Chỉ cache nếu đang load trang đầu tiên và Cache bị rỗng
    if (!cursor && domainMsgs.length > 0) {
      const pipeline = this.redis.pipeline();
      domainMsgs.slice(0, 50).forEach((msg) => {
        pipeline.rpush(redisKey, JSON.stringify(ChatMapper.toDto(msg)));
      });
      pipeline.expire(redisKey, 60 * 60 * 24 * 7);
      await pipeline.exec();
    }

    // Trả về kết quả (Reverse để client dễ render: Trên cùng là tin cũ, dưới cùng là tin mới)
    return domainMsgs.reverse();
  }

  private async cacheMessagesToRedis(key: string, messages: Message[]) {
    if (messages.length === 0) return;

    const pipeline = this.redis.pipeline();

    // Xóa cache cũ để tránh duplicate/sai lệch (Optional - tuỳ chiến lược)
    // pipeline.del(key);

    // Lưu vào Redis: [Newest -> Oldest]
    // Vì 'messages' đang là DESC (từ DB), ta push vào list.
    messages.forEach((msg) => {
      // RPUSH: Đẩy vào đuôi.
      // Nếu Redis đang rỗng, List sẽ là [Newest, 2nd Newest, ..., Oldest]
      pipeline.rpush(key, JSON.stringify(msg));
    });

    pipeline.expire(key, 60 * 60 * 24 * 7); // 7 ngày
    await pipeline.exec();
  }

  // --- CÁC HÀM KHÁC GIỮ NGUYÊN ---

  async createConversation(conversation: Conversation): Promise<Conversation> {
    const savedConv = await this.prisma.conversation.create({
      data: {
        creatorId: conversation.creatorId,
        participantIds: conversation.participantIds,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        isGroup: conversation.isGroup,
        lastMessage: conversation.lastMessage || null,
        lastMessageAt: conversation.lastMessageAt || null,
      },
    });
    return ConversationMapper.toDomain(savedConv);
  }

  async findConversation(id: string): Promise<Conversation | null> {
    // 1. Lấy dữ liệu thô từ MongoDB
    const foundConv = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!foundConv) return null;

    // 2. Chuyển sang Domain Entity
    const domainConv = ConversationMapper.toDomain(foundConv);

    // 3. Gọi User Service để lấy thông tin chi tiết Participants
    try {
      const response = await this.userService.findUsersByIds(
        domainConv.participantIds,
      );

      let usersList: ChatParticipant[] = [];

      // Xử lý response (Array hoặc Object wrapping)
      if (Array.isArray(response)) {
        usersList = response as unknown as ChatParticipant[];
      } else if (
        response &&
        'users' in response &&
        Array.isArray((response as Record<string, unknown>).users)
      ) {
        usersList = (response as Record<string, unknown>)
          .users as ChatParticipant[];
      }

      // Tạo Map để lookup cho nhanh
      const usersMap = new Map<string, ChatParticipant>();
      usersList.forEach((u) => {
        if (u && u.id) usersMap.set(u.id, u);
      });

      // 4. Map dữ liệu user vào Conversation
      domainConv.participants = domainConv.participantIds
        .map((uid) => usersMap.get(uid))
        .filter((u): u is ChatParticipant => u !== undefined);
    } catch (error) {
      // Nếu User Service chết, log lỗi nhưng KHÔNG throw exception.
      // Vẫn trả về conversation để user chat được (dù không thấy avatar/tên)
      this.logger.error(
        `[findConversation] Failed to fetch participants for ${id}`,
        error,
      );
      domainConv.participants = [];
    }

    return domainConv;
  }

  async findConversationsByUserId(
    userId: string,
    limit: number = 15,
    cursor?: string, // ID của conversation cuối cùng trong list hiện tại
  ): Promise<Conversation[]> {
    // 1. Query Prisma với Cursor
    const conversations = await this.prisma.conversation.findMany({
      where: { participantIds: { has: userId } },
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { lastMessageAt: 'desc' }, // Sắp xếp theo tin nhắn mới nhất
    });

    if (!conversations.length) return [];

    // 2. Gom ID để Bulk Fetch User Info (Giữ nguyên logic tối ưu cũ)
    const allParticipantIds = [
      ...new Set(conversations.flatMap((c) => c.participantIds)),
    ];

    const usersMap = new Map<string, ChatParticipant>();

    try {
      const response = await this.userService.findUsersByIds(allParticipantIds);
      let usersList: ChatParticipant[] = [];

      if (Array.isArray(response)) {
        usersList = response as unknown as ChatParticipant[];
      } else if (
        response &&
        'users' in response &&
        Array.isArray((response as Record<string, unknown>).users)
      ) {
        usersList = (response as Record<string, unknown>)
          .users as ChatParticipant[];
      }

      usersList.forEach((u) => {
        if (u && u.id) usersMap.set(u.id, u);
      });
    } catch (error) {
      this.logger.error('Failed to fetch user details', error);
    }

    // 3. Map Participants
    return conversations.map((c) => {
      const domainConv = ConversationMapper.toDomain(c);
      domainConv.participants = c.participantIds
        .map((id) => usersMap.get(id))
        .filter((u): u is ChatParticipant => u !== undefined);
      return domainConv;
    });
  }

  async findPrivateConversation(
    userId1: string,
    userId2: string,
  ): Promise<Conversation | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        isGroup: false,
        participantIds: { hasEvery: [userId1, userId2] },
      },
    });
    if (!conversation) return null;
    return ConversationMapper.toDomain(conversation);
  }

  async addReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<Message> {
    if (!emoji.trim()) {
      throw new BadRequestException('Emoji is required');
    }

    const existingMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!existingMessage) {
      throw new NotFoundException('Message not found');
    }

    await this.assertConversationParticipant(
      existingMessage.conversationId,
      userId,
    );

    const reactions = this.normalizeReactions(existingMessage.reactions);
    const nextReactions: MessageReactionMap = {
      ...(reactions || {}),
      [userId]: {
        emoji,
        createdAt: new Date().toISOString(),
      },
    };

    const updatedMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        reactions: nextReactions as unknown as Prisma.InputJsonValue,
      },
    });

    await this.clearConversationCache(updatedMessage.conversationId);
    return ChatMapper.toDomain(updatedMessage);
  }

  async removeReaction(messageId: string, userId: string): Promise<Message> {
    const existingMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!existingMessage) {
      throw new NotFoundException('Message not found');
    }

    await this.assertConversationParticipant(
      existingMessage.conversationId,
      userId,
    );

    const reactions = this.normalizeReactions(existingMessage.reactions);
    if (!reactions || !reactions[userId]) {
      return ChatMapper.toDomain(existingMessage);
    }

    const remainingReactions = { ...reactions };
    delete remainingReactions[userId];

    const updatedMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        reactions:
          Object.keys(remainingReactions).length > 0
            ? (remainingReactions as unknown as Prisma.InputJsonValue)
            : null,
      },
    });

    await this.clearConversationCache(updatedMessage.conversationId);
    return ChatMapper.toDomain(updatedMessage);
  }

  async recallMessage(
    messageId: string,
    userId: string,
  ): Promise<RecallMessageResult> {
    const existingMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!existingMessage) {
      throw new NotFoundException('Message not found');
    }

    await this.assertConversationParticipant(
      existingMessage.conversationId,
      userId,
    );

    if (existingMessage.senderId !== userId) {
      throw new ForbiddenException('You can only recall your own messages');
    }

    if (existingMessage.isRecalled) {
      throw new BadRequestException('Message already recalled');
    }

    if (existingMessage.type === 'call') {
      throw new BadRequestException(
        'This message type does not support recall',
      );
    }

    if (Date.now() - existingMessage.createdAt.getTime() > RECALL_WINDOW_MS) {
      throw new BadRequestException(
        'Message can only be recalled within 24 hours',
      );
    }

    const recalledAt = new Date();
    const conversationId = existingMessage.conversationId;

    const result = await this.prisma.$transaction(async (tx) => {
      const replyMessages = await tx.message.findMany({
        where: {
          conversationId,
          replyToId: messageId,
        },
        select: {
          id: true,
          replyPreview: true,
        },
      });

      const latestMessage = await tx.message.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      const updatedMessage = await tx.message.update({
        where: { id: messageId },
        data: {
          isRecalled: true,
          recalledAt,
          reactions: null,
        },
      });

      const updatedReplyMessageIds: string[] = [];

      for (const replyMessage of replyMessages) {
        const nextReplyPreview = this.mergeReplyPreviewContent(
          replyMessage.replyPreview,
          RECALLED_PREVIEW_CONTENT,
        );

        if (!nextReplyPreview) {
          continue;
        }

        await tx.message.update({
          where: { id: replyMessage.id },
          data: {
            replyPreview: nextReplyPreview as unknown as Prisma.InputJsonValue,
          },
        });

        updatedReplyMessageIds.push(replyMessage.id);
      }

      if (latestMessage?.id === messageId) {
        await tx.conversation.update({
          where: { id: conversationId },
          data: {
            lastMessage: RECALLED_LAST_MESSAGE,
          },
        });
      }

      return {
        updatedMessage,
        updatedReplyMessageIds,
      };
    });

    await this.clearConversationCache(conversationId);

    return {
      message: ChatMapper.toDomain(result.updatedMessage),
      updatedReplyMessageIds: result.updatedReplyMessageIds,
      previewContent: RECALLED_PREVIEW_CONTENT,
    };
  }

  async markMessagesAsSeen(
    conversationId: string,
    userId: string,
  ): Promise<number> {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(conversationId);
    if (!isObjectId) throw new BadRequestException('Invalid conversation ID');

    await this.assertConversationParticipant(conversationId, userId);

    try {
      const result = await this.prisma.message.updateMany({
        where: {
          conversationId: conversationId,
          senderId: { not: userId },
          readBy: { none: { userId: userId } },
        },
        data: {
          readBy: { push: { userId: userId, at: new Date() } },
        },
      });

      if (result.count > 0) {
        await this.clearConversationCache(conversationId);
      }
      return result.count;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Could not mark seen');
    }
  }

  private normalizeReactions(value: unknown): MessageReactionMap | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const normalized = Object.entries(value as Record<string, unknown>)
      .map(([userId, reaction]) => {
        if (
          !reaction ||
          typeof reaction !== 'object' ||
          Array.isArray(reaction)
        ) {
          return null;
        }

        const emoji = (reaction as Record<string, unknown>).emoji;
        const createdAt = (reaction as Record<string, unknown>).createdAt;

        if (typeof emoji !== 'string' || typeof createdAt !== 'string') {
          return null;
        }

        return [userId, { emoji, createdAt }] as const;
      })
      .filter(
        (
          entry,
        ): entry is readonly [string, { emoji: string; createdAt: string }] =>
          entry !== null,
      );

    return normalized.length > 0 ? Object.fromEntries(normalized) : undefined;
  }

  private normalizeReplyPreview(
    value: unknown,
  ): MessageReplyPreview | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const senderName = (value as Record<string, unknown>).senderName;
    const content = (value as Record<string, unknown>).content;
    const type = (value as Record<string, unknown>).type;

    if (
      typeof senderName !== 'string' ||
      typeof content !== 'string' ||
      !['text', 'image', 'video', 'file', 'call'].includes(String(type))
    ) {
      return undefined;
    }

    return {
      senderName,
      content,
      type: type as MessageReplyPreview['type'],
    };
  }

  private mergeReplyPreviewContent(
    value: unknown,
    content: string,
  ): MessageReplyPreview | undefined {
    const current = this.normalizeReplyPreview(value);

    if (!current) {
      return undefined;
    }

    return {
      ...current,
      content,
    };
  }

  private async clearConversationCache(conversationId: string) {
    try {
      await this.redis.del(`chat:history:${conversationId}`);
    } catch (error) {
      this.logger.error(error);
    }
  }

  async assertConversationParticipant(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { participantIds: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.participantIds.includes(userId)) {
      throw new ForbiddenException(
        'You are not allowed to access messages in this conversation',
      );
    }
  }

  private async buildReplyPreview(
    replyToId: string | undefined,
    conversationId: string,
  ): Promise<MessageReplyPreview | undefined> {
    if (!replyToId) {
      return undefined;
    }

    const replyTarget = await this.prisma.message.findUnique({
      where: { id: replyToId },
    });

    if (!replyTarget || replyTarget.conversationId !== conversationId) {
      throw new BadRequestException('Reply target is invalid');
    }

    return {
      senderName: await this.getUserPreviewName(replyTarget.senderId),
      content: this.getReplyPreviewContent(replyTarget),
      type: this.getReplyPreviewType(replyTarget.type),
    };
  }

  private getReplyPreviewContent(message: {
    content: string;
    type: string;
    signalType: number;
    isRecalled: boolean;
  }) {
    if (message.isRecalled) {
      return RECALLED_PREVIEW_CONTENT;
    }

    if (message.type !== 'text') {
      return this.getAttachmentPreviewLabel(message.type);
    }

    if (message.signalType !== 0) {
      return '🔒 Tin nhắn được bảo mật';
    }

    try {
      return this.encryptionRepository.decrypt(message.content);
    } catch {
      return '🔒 Tin nhắn được bảo mật';
    }
  }

  private getReplyPreviewType(type: string): MessageReplyPreview['type'] {
    if (['image', 'video', 'file', 'call'].includes(type)) {
      return type as MessageReplyPreview['type'];
    }

    return 'text';
  }

  private getAttachmentPreviewLabel(type: string) {
    const typeMap: Record<string, string> = {
      image: '[Hình ảnh]',
      video: '[Video]',
      file: '[Tập tin]',
      call: '📞 Cuộc gọi',
    };

    return typeMap[type] || 'Tin nhắn mới';
  }

  private async getUserPreviewName(userId: string) {
    try {
      const response = await this.userService.findUsersByIds([userId]);

      let usersList: ChatParticipant[] = [];

      if (Array.isArray(response)) {
        usersList = response as unknown as ChatParticipant[];
      } else if (
        response &&
        'users' in response &&
        Array.isArray((response as Record<string, unknown>).users)
      ) {
        usersList = (response as Record<string, unknown>)
          .users as ChatParticipant[];
      }

      const user = usersList.find((item) => item.id === userId);
      if (user?.name?.trim()) {
        return user.name.trim();
      }
      if (user?.email?.trim()) {
        return user.email.split('@')[0];
      }
    } catch (error) {
      this.logger.error(`[getUserPreviewName] Failed for ${userId}`, error);
    }

    return 'User';
  }
}
