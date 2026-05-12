import { Controller, Inject, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { GetUserConversationsUseCase } from './../../application/use-cases/get-user-conversations.use-case';

// DTOs
import { CreateConversationDto } from '@common/conversation/dtos/create-conversation.dto';
import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';

// Use Cases
import { CreateConversationUseCase } from 'apps/conversation-service/src/application/use-cases/create-conversastion.use-case';
import { IChatRepository } from 'apps/conversation-service/src/domain/interfaces/chat.repository.interface';
import { ChatGateway } from 'apps/conversation-service/src/infrastructure/gateways/chat.gateway';
import { GetConversationUseCase } from '../../application/use-cases/get-conversation.use-case';
import { GetMessagesUseCase } from '../../application/use-cases/get-messages.use-case';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';

@Controller()
export class ConversationMicroserviceController {
  private readonly logger = new Logger(ConversationMicroserviceController.name);

  constructor(
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly getMessagesUseCase: GetMessagesUseCase,
    private readonly getConversationUseCase: GetConversationUseCase,
    // 👇 Inject UseCase mới vào đây
    private readonly createConversationUseCase: CreateConversationUseCase,
    private readonly getUserConversationsUseCase: GetUserConversationsUseCase,
    private readonly chatGateway: ChatGateway,
    @Inject('IChatRepository')
    private readonly chatRepository: IChatRepository,
  ) {}

  // --- 1. TẠO CUỘC TRÒ CHUYỆN (MỚI THÊM) ---
  @MessagePattern('create_conversation')
  async handleCreateConversation(
    @Payload() payload: CreateConversationDto & { creatorId: string },
  ) {
    try {
      const { creatorId, ...dto } = payload;
      this.logger.log(
        `📥 [CreateConversation] Creator: ${creatorId} | Participants: ${JSON.stringify(dto.participantIds)}`,
      );

      // 2. Truyền creatorId vào tham số thứ 2 của UseCase (như đã sửa ở bước trước)
      const newConversation = await this.createConversationUseCase.execute(
        dto,
        creatorId,
      );

      this.logger.log(`✅ [CreateConversation] Success: ${newConversation.id}`);
      return newConversation;
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ [CreateConversation] Error: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  // --- 2. LẤY TIN NHẮN ---
  @MessagePattern('get_messages')
  async handleGetMessages(
    @Payload()
    data: {
      conversationId: string;
      userId: string;
      limit?: number; // Optional, default handled in repo/usecase
      cursor?: string; // Optional: Message ID để load history
    },
  ) {
    try {
      // Gọi UseCase (Bạn cần update UseCase để truyền params xuống repo)
      return await this.getMessagesUseCase.execute(
        data.conversationId,
        data.userId,
        Number(data.limit),
        data.cursor,
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ [GetMessages] Error: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  // --- 3. LẤY CHI TIẾT CONVERSATION ---
  @MessagePattern('get_conversation_detail')
  async handleGetConversation(@Payload() data: { id: string; userId: string }) {
    try {
      return await this.getConversationUseCase.execute(data.id, data.userId);
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ [GetConversation] Error: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  // --- 4. TẠO TIN NHẮN ---
  @MessagePattern('create_message')
  async handleCreateMessage(
    @Payload() data: CreateMessageDto & { senderId: string },
  ) {
    try {
      const { senderId, ...dto } = data;

      // 👇 1. Lấy kết quả Destructuring (Vì UseCase trả về { message, conversation })
      const { message, conversation } = await this.sendMessageUseCase.execute(
        dto,
        senderId,
      );

      this.logger.log(`✅ [CreateMessage] Sent: ${message.id}`);

      // 👇 2. Bắn sự kiện New Message (Vào phòng chat)
      this.chatGateway.server
        .to(message.conversationId)
        .emit('new_message', message);

      // 👇 3. Bắn sự kiện Update Sidebar (Vào từng user) - Quan trọng để đồng bộ
      if (conversation && conversation.participantIds) {
        conversation.participantIds.forEach((participantId) => {
          this.chatGateway.server
            .to(participantId) // Gửi vào room riêng của user
            .emit('conversation_updated', conversation);
        });
      }

      // 👇 4. Trả về cả message và conversation (để API Gateway trả về Frontend nếu cần)
      return { message, conversation };
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ [CreateMessage] Error: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('get_user_conversations')
  async handleGetUserConversations(
    @Payload()
    data: {
      userId: string;
      limit?: number;
      cursor?: string; // Conversation ID để load more
    },
  ) {
    try {
      return await this.getUserConversationsUseCase.execute(
        data.userId,
        Number(data.limit),
        data.cursor,
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(error.message);
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('add_reaction')
  async handleAddReaction(
    @Payload() data: { messageId: string; userId: string; emoji: string },
  ) {
    try {
      const message = await this.chatRepository.addReaction(
        data.messageId,
        data.userId,
        data.emoji,
      );

      this.chatGateway.server
        .to(message.conversationId)
        .emit('message_reaction_updated', message);

      return message;
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ [AddReaction] Error: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('remove_reaction')
  async handleRemoveReaction(
    @Payload() data: { messageId: string; userId: string },
  ) {
    try {
      const message = await this.chatRepository.removeReaction(
        data.messageId,
        data.userId,
      );

      this.chatGateway.server
        .to(message.conversationId)
        .emit('message_reaction_updated', message);

      return message;
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ [RemoveReaction] Error: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('recall_message')
  async handleRecallMessage(
    @Payload() data: { messageId: string; userId: string },
  ) {
    try {
      const result = await this.chatRepository.recallMessage(
        data.messageId,
        data.userId,
      );

      this.chatGateway.server.to(result.message.conversationId).emit(
        'message_recalled',
        {
          messageId: result.message.id,
          conversationId: result.message.conversationId,
          recalledAt: result.message.recalledAt,
        },
      );

      if (result.updatedReplyMessageIds.length > 0) {
        this.chatGateway.server.to(result.message.conversationId).emit(
          'reply_previews_updated',
          {
            updatedMessageIds: result.updatedReplyMessageIds,
            previewContent: result.previewContent,
          },
        );
      }

      const conversation = await this.chatRepository.findConversation(
        result.message.conversationId,
      );

      if (conversation?.participantIds?.length) {
        conversation.participantIds.forEach((participantId) => {
          this.chatGateway.server
            .to(participantId)
            .emit('conversation_updated', conversation);
        });
      }

      return result.message;
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ [RecallMessage] Error: ${error.message}`);
      throw new RpcException(error.message);
    }
  }
}
