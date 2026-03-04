import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

// Entities & Interfaces
import {
  ChatParticipant,
  Conversation,
} from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
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

// 👇 1. CẬP NHẬT INTERFACE CACHE
interface CachedMessage {
  id: string;
  conversationId: string;
  senderId: string;

  type: string; // Business Type
  signalType: number; // Signal Type

  content: string; // Cho người nhận
  createdAt: string;
  readBy?: CachedReadStatus[];
}

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
    // BƯỚC 1: Chuẩn bị dữ liệu (CPU bound - cực nhanh)
    let contentToSave = message.content;

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
          signalType: message.signalType ?? 1,
          content: contentToSave,
          registrationId: message.registrationId,
          senderId: message.senderId,
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
    this.updateRedisInBackground(domainMsg).catch((err) => {
      this.logger.error(
        `Failed to update cache for msg ${domainMsg.id}`,
        err.stack,
      );
    });

    return domainMsg;
  }

  private async updateRedisInBackground(domainMsg: Message) {
    const redisKey = `chat:history:${domainMsg.conversationId}`;

    // Dùng pipeline để gom lệnh Redis
    const pipeline = this.redis.pipeline();

    pipeline.lpush(
      redisKey,
      JSON.stringify({
        ...domainMsg,
        createdAt: domainMsg.createdAt.toISOString(),
      }),
    );
    pipeline.ltrim(redisKey, 0, 49); // Giữ 50 tin mới nhất
    pipeline.expire(redisKey, 60 * 60 * 24 * 7); // Gia hạn

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
              type: plain.type,
              signalType: plain.signalType,
              content: plain.content,
              createdAt: new Date(plain.createdAt),

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
      // Cache tối đa 50 tin mới nhất thôi
      domainMsgs.slice(0, 50).forEach((msg) => {
        pipeline.rpush(
          redisKey,
          JSON.stringify({
            ...msg,
            createdAt: msg.createdAt.toISOString(),
          }),
        );
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
        Array.isArray((response as any).users)
      ) {
        usersList = (response as any).users as ChatParticipant[];
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
        Array.isArray((response as any).users)
      ) {
        usersList = (response as any).users as ChatParticipant[];
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

  async markMessagesAsSeen(
    conversationId: string,
    userId: string,
  ): Promise<number> {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(conversationId);
    if (!isObjectId) throw new BadRequestException('Invalid conversation ID');

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
        try {
          await this.redis.del(`chat:history:${conversationId}`);
        } catch (e) {
          this.logger.error(e);
        }
      }
      return result.count;
    } catch (error) {
      this.logger.error(error);
      throw new InternalServerErrorException('Could not mark seen');
    }
  }
}
