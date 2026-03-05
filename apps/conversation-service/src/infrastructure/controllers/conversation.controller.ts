import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { GetUserConversationsUseCase } from './../../application/use-cases/get-user-conversations.use-case';

// DTOs
import { CreateConversationDto } from '@common/conversation/dtos/create-conversation.dto';
import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';

// Use Cases
import { CreateConversationUseCase } from 'apps/conversation-service/src/application/use-cases/create-conversastion.use-case';
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
}
