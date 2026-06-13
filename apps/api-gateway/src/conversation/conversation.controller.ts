import { CurrentUser } from '@common/auth/decorators/current-user.decorator';
import type { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { BOT_USER_ID } from '@common/constants/seed.constants';
import { ChatWithBotDto } from '@common/conversation/dtos/chat-with-bot.dto';
import { ConversationDto } from '@common/conversation/dtos/conversation.dto';
import { CreateConversationDto } from '@common/conversation/dtos/create-conversation.dto';
import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';
import { MessageDto } from '@common/conversation/dtos/message.dto';
import { CreateMessageResponse } from '@common/conversation/interfaces/create-message-response.interface';
import { MessageAnchorExpansionResponse } from '@common/conversation/interfaces/message-anchor-expansion.interface';
import { MessageAnchorWindowResponse } from '@common/conversation/interfaces/message-anchor-window.interface';
import type { Reel } from '@content/domain/entities/reel.entity';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import { ReelAuthorService } from '@gateway/content/reel-author.service';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotImplementedException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { lastValueFrom } from 'rxjs';

interface ConversationParticipantPayload {
  id: string;
  email?: string;
  picture?: string;
  avatar?: string;
}

@ApiTags('Conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConversationController {
  constructor(
    @Inject('CONVERSATION_SERVICE')
    private readonly conversationClient: ClientProxy,
    @Inject('CONTENT_SERVICE')
    private readonly contentClient: ClientProxy,
    private readonly reelAuthorService: ReelAuthorService,
  ) {}

  private async enrichReelOwnersInMessageResponses(
    messages: MessageDto[],
  ): Promise<MessageDto[]> {
    const reelOwnerIdsByIndex = new Map<number, string>();

    await Promise.all(
      messages.map(async (message, index) => {
        if (message.type !== 'reel' || !message.media) {
          return;
        }

        const media = message.media as Record<string, unknown>;
        const reelOwnerId =
          typeof media.reelOwnerId === 'string'
            ? media.reelOwnerId
            : await this.resolveReelOwnerId(media);

        if (reelOwnerId) {
          reelOwnerIdsByIndex.set(index, reelOwnerId);
        }
      }),
    );

    const authorsById = await this.reelAuthorService.loadAuthorMap([
      ...new Set(reelOwnerIdsByIndex.values()),
    ]);

    return messages.map((message, index) =>
      this.buildReelOwnerEnrichedMessageResponse(
        message,
        reelOwnerIdsByIndex.get(index) ?? null,
        authorsById,
      ),
    );
  }

  private async enrichReelOwnerInMessageResponse(
    message: MessageDto,
  ): Promise<MessageDto> {
    const [enrichedMessage] = await this.enrichReelOwnersInMessageResponses([
      message,
    ]);

    return enrichedMessage;
  }

  private buildReelOwnerEnrichedMessageResponse(
    message: MessageDto,
    reelOwnerId: string | null,
    authorsById: Parameters<ReelAuthorService['resolveAuthor']>[0],
  ): MessageDto {
    if (message.type !== 'reel' || !message.media) {
      return message;
    }

    const media = message.media as Record<string, unknown>;
    const responseMedia = { ...media };
    delete responseMedia.reelOwnerId;

    if (!reelOwnerId) {
      return {
        ...message,
        media: responseMedia as MessageDto['media'],
      };
    }

    const author = this.reelAuthorService.resolveAuthor(
      authorsById,
      reelOwnerId,
    );

    return {
      ...message,
      media: {
        ...responseMedia,
        ...(author.username ? { reelOwnerUsername: author.username } : {}),
        ...(author.avatarUrl ? { reelOwnerAvatarUrl: author.avatarUrl } : {}),
      } as MessageDto['media'],
    };
  }

  private async resolveReelOwnerId(
    media: Record<string, unknown>,
  ): Promise<string | null> {
    if (typeof media.reelId !== 'string' || media.reelId.trim().length === 0) {
      return null;
    }

    try {
      const reel = await lastValueFrom(
        this.contentClient.send<Reel>('content.get_reel', {
          reelId: media.reelId.trim(),
        }),
      );

      return typeof reel?.userId === 'string' ? reel.userId : null;
    } catch {
      return null;
    }
  }

  @Post()
  @ApiOperation({ summary: 'Tạo cuộc hội thoại mới' })
  @ApiBody({ type: CreateConversationDto })
  async createConversation(
    @Body()
    body: {
      participantIds?: string[];
      isGroup?: boolean;
      type?: 'DIRECT' | 'GROUP';
      name?: string;
    },
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string }> {
    const participantIds = Array.isArray(body?.participantIds)
      ? body.participantIds.filter(
          (participantId): participantId is string =>
            typeof participantId === 'string' &&
            participantId.trim().length > 0,
        )
      : [];

    if (participantIds.length === 0) {
      throw new BadRequestException(
        'participantIds must contain at least one target user id',
      );
    }

    return await lastValueFrom(
      this.conversationClient.send<{ id: string }>('create_conversation', {
        participantIds,
        isGroup: body?.isGroup === true || body?.type === 'GROUP',
        creatorId: user.id,
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách hội thoại (Pagination)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  getMyConversations(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.conversationClient.send('get_user_conversations', {
      userId: user.id,
      limit: limit ? Number(limit) : 15,
      cursor,
    });
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Lấy lịch sử tin nhắn (Pagination)' })
  @ApiOkResponse({ type: [MessageDto] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async getMessages(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ): Promise<MessageDto[]> {
    const messages = await lastValueFrom(
      this.conversationClient.send<MessageDto[]>('get_messages', {
        conversationId,
        userId: user.id,
        limit: limit ? Number(limit) : 20,
        cursor,
      }),
    );

    return await this.enrichReelOwnersInMessageResponses(messages);
  }

  @Get(':id/messages/around/:messageId')
  @ApiOperation({ summary: 'Lấy cửa sổ tin nhắn quanh một tin nhắn mục tiêu' })
  @ApiOkResponse({ type: MessageDto, isArray: true })
  @ApiQuery({ name: 'before', required: false, type: Number })
  @ApiQuery({ name: 'after', required: false, type: Number })
  async getMessagesAround(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthUser,
    @Query('before') before?: number,
    @Query('after') after?: number,
  ): Promise<MessageAnchorWindowResponse> {
    const response = await lastValueFrom(
      this.conversationClient.send<MessageAnchorWindowResponse>(
        'get_messages_around',
        {
          conversationId,
          userId: user.id,
          messageId,
          before: before ? Number(before) : 30,
          after: after ? Number(after) : 30,
        },
      ),
    );

    return {
      ...response,
      messages: await this.enrichReelOwnersInMessageResponses(
        response.messages,
      ),
    };
  }

  @Get(':id/messages/anchor/older')
  @ApiOperation({ summary: 'Lấy thêm tin nhắn cũ hơn trong anchor timeline' })
  @ApiQuery({ name: 'cursor', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAnchorOlderMessages(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor: string,
    @Query('limit') limit?: number,
  ): Promise<MessageAnchorExpansionResponse> {
    if (typeof cursor !== 'string' || cursor.trim().length === 0) {
      throw new BadRequestException('cursor must be a non-empty string');
    }

    const response = await lastValueFrom(
      this.conversationClient.send<MessageAnchorExpansionResponse>(
        'get_anchor_older_messages',
        {
          conversationId,
          userId: user.id,
          cursor: cursor.trim(),
          limit: limit ? Number(limit) : 30,
        },
      ),
    );

    return {
      ...response,
      messages: await this.enrichReelOwnersInMessageResponses(
        response.messages,
      ),
    };
  }

  @Get(':id/messages/anchor/newer')
  @ApiOperation({ summary: 'Lấy thêm tin nhắn mới hơn trong anchor timeline' })
  @ApiQuery({ name: 'cursor', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAnchorNewerMessages(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor: string,
    @Query('limit') limit?: number,
  ): Promise<MessageAnchorExpansionResponse> {
    if (typeof cursor !== 'string' || cursor.trim().length === 0) {
      throw new BadRequestException('cursor must be a non-empty string');
    }

    const response = await lastValueFrom(
      this.conversationClient.send<MessageAnchorExpansionResponse>(
        'get_anchor_newer_messages',
        {
          conversationId,
          userId: user.id,
          cursor: cursor.trim(),
          limit: limit ? Number(limit) : 30,
        },
      ),
    );

    return {
      ...response,
      messages: await this.enrichReelOwnersInMessageResponses(
        response.messages,
      ),
    };
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Gửi tin nhắn theo conversation id (HTTP)' })
  @ApiOkResponse({ type: MessageDto })
  async createMessageForConversation(
    @Param('id') conversationId: string,
    @Body()
    body: {
      clientMessageId?: string;
      content?: string;
      type?: 'text' | 'image' | 'video' | 'file' | 'call' | 'reel';
      media?: {
        fileKey?: string;
        fileUrl: string;
        thumbnailKey?: string;
        thumbnailUrl?: string;
        mimeType?: string;
        width?: number;
        height?: number;
        durationMs?: number;
        status?: 'ready' | 'processing' | 'failed';
        failureReason?: string;
        reelId?: string;
        reelOwnerId?: string;
        reelTitle?: string;
        reelDescription?: string;
      };
      signalType?: number;
      registrationId?: number;
      replyToId?: string;
    },
    @CurrentUser() user: AuthUser,
  ): Promise<MessageDto> {
    if (typeof body?.content !== 'string' || body.content.trim().length === 0) {
      throw new BadRequestException('Content cannot be empty');
    }

    const type = body?.type ?? 'text';
    if (!['text', 'image', 'video', 'file', 'call', 'reel'].includes(type)) {
      throw new BadRequestException('Invalid message type');
    }

    const signalType = body?.signalType ?? 0;
    if (![0, 1, 3].includes(signalType)) {
      throw new BadRequestException('Invalid signalType');
    }

    if (
      body?.replyToId !== undefined &&
      (typeof body.replyToId !== 'string' || body.replyToId.trim().length === 0)
    ) {
      throw new BadRequestException('replyToId must be a non-empty string');
    }

    const response = await lastValueFrom(
      this.conversationClient.send<CreateMessageResponse>('create_message', {
        conversationId,
        clientMessageId: body.clientMessageId,
        content: body.content.trim(),
        media: body.media,
        type,
        signalType,
        registrationId: body.registrationId,
        replyToId: body.replyToId,
        senderId: user.id,
      }),
    );

    return await this.enrichReelOwnerInMessageResponse(response.message);
  }

  @Patch(':id/messages/:messageId')
  @ApiOperation({ summary: 'Cập nhật tin nhắn (chưa được hỗ trợ)' })
  updateMessage(): never {
    throw new NotImplementedException(
      'Message editing is not implemented by conversation-service yet',
    );
  }

  @Delete(':id/messages/:messageId')
  @ApiOperation({ summary: 'Xóa tin nhắn (chưa được hỗ trợ)' })
  deleteMessage(): never {
    throw new NotImplementedException(
      'Message deletion is not implemented by conversation-service yet',
    );
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Đánh dấu hội thoại đã đọc' })
  async markConversationSeen(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ updatedCount: number }> {
    return await lastValueFrom(
      this.conversationClient.send<{ updatedCount: number }>(
        'mark_conversation_seen',
        {
          conversationId,
          userId: user.id,
        },
      ),
    );
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Lấy danh sách thành viên hội thoại' })
  async getConversationMembers(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<
    Array<{
      userId: string;
      user: { id: string; email: string; picture?: string };
      joinedAt: string;
    }>
  > {
    const conversation = await lastValueFrom(
      this.conversationClient.send<{
        createdAt?: string;
        participants?: ConversationParticipantPayload[];
      }>('get_conversation_detail', {
        id: conversationId,
        userId: user.id,
      }),
    );

    const joinedAt = conversation?.createdAt ?? new Date(0).toISOString();

    return Array.isArray(conversation?.participants)
      ? conversation.participants.map((participant) => ({
          userId: participant.id,
          user: {
            id: participant.id,
            email: participant.email ?? '',
            ...(participant.picture || participant.avatar
              ? { picture: participant.picture ?? participant.avatar }
              : {}),
          },
          joinedAt,
        }))
      : [];
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Thêm thành viên (chưa được hỗ trợ)' })
  addMember(): never {
    throw new NotImplementedException(
      'Adding conversation members is not implemented by conversation-service yet',
    );
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Xóa thành viên (chưa được hỗ trợ)' })
  removeMember(): never {
    throw new NotImplementedException(
      'Removing conversation members is not implemented by conversation-service yet',
    );
  }

  @Post(':id/messages/:messageId/recall')
  @ApiOperation({ summary: 'Thu hồi một tin nhắn' })
  @ApiOkResponse({ type: MessageDto })
  async recallMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<MessageDto> {
    if (!/^[0-9a-fA-F]{24}$/.test(messageId)) {
      throw new BadRequestException('Invalid message ID');
    }

    const source$ = this.conversationClient.send('recall_message', {
      conversationId,
      messageId,
      userId: user.id,
    });

    return (await lastValueFrom(source$)) as MessageDto;
  }

  // --- 3. LẤY CHI TIẾT CONVERSATION ---
  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin cuộc hội thoại' })
  async getConversation(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ConversationDto> {
    return await lastValueFrom(
      this.conversationClient.send<ConversationDto>('get_conversation_detail', {
        id,
        userId: user.id,
      }),
    );
  }

  @Post('message')
  @ApiOperation({ summary: 'Gửi tin nhắn (HTTP)' })
  @ApiBody({ type: CreateMessageDto })
  @ApiOkResponse({ type: MessageDto })
  async createMessage(
    @Body() body: CreateMessageDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MessageDto> {
    const response = await lastValueFrom(
      this.conversationClient.send<CreateMessageResponse>('create_message', {
        ...body,
        senderId: user.id,
      }),
    );
    return await this.enrichReelOwnerInMessageResponse(response.message);
  }

  @Post('chat')
  @ApiOperation({
    summary:
      'Chat with AI Bot — creates/finds bot conversation then sends message. Bot reply comes via WebSocket.',
  })
  @ApiBody({ type: ChatWithBotDto })
  @ApiOkResponse({ type: MessageDto })
  async chatWithBot(
    @Body() body: ChatWithBotDto,
    @CurrentUser() user: AuthUser,
  ): Promise<MessageDto> {
    const botParticipantId = BOT_USER_ID;

    const convResult = await lastValueFrom(
      this.conversationClient.send<{ id: string }>('create_conversation', {
        participantIds: [user.id, botParticipantId],
        isGroup: false,
      }),
    );

    const messageResponse = await lastValueFrom(
      this.conversationClient.send<CreateMessageResponse>('create_message', {
        content: body.content,
        type: body.type,
        signalType: body.signalType,
        registrationId: body.registrationId,
        conversationId: convResult.id,
        senderId: user.id,
      }),
    );

    return messageResponse.message;
  }
}
