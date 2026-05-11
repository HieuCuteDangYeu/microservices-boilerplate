import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';
import { CreateMessageResponse } from '@common/conversation/interfaces/create-message-response.interface';
import { Controller, Inject, Logger } from '@nestjs/common';
import {
  EventPattern,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';
import { CreateConversationUseCase } from '../../application/use-cases/create-conversastion.use-case';
import { GetConversationUseCase } from '../../application/use-cases/get-conversation.use-case';
import { GetMessagesUseCase } from '../../application/use-cases/get-messages.use-case';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';
import { TriggerBotReplyUseCase } from '../../application/use-cases/trigger-bot-reply.use-case';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import { ChatGateway } from '../gateways/chat.gateway';
import { ChatMapper } from '../repositories/chat.mapper';
import { GetUserConversationsUseCase } from './../../application/use-cases/get-user-conversations.use-case';

@Controller()
export class ConversationMicroserviceController {
  private readonly logger = new Logger(ConversationMicroserviceController.name);

  constructor(
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly getMessagesUseCase: GetMessagesUseCase,
    private readonly getConversationUseCase: GetConversationUseCase,
    private readonly createConversationUseCase: CreateConversationUseCase,
    private readonly getUserConversationsUseCase: GetUserConversationsUseCase,
    private readonly chatGateway: ChatGateway,
    private readonly triggerBotReplyUseCase: TriggerBotReplyUseCase,
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
  ) {}

  @MessagePattern('create_conversation')
  async handleCreateConversation(
    @Payload()
    payload: {
      participantIds: string[];
      isGroup: boolean;
      creatorId?: string;
    },
  ) {
    try {
      const creatorId = payload.creatorId ?? payload.participantIds[0];
      const conv = await this.createConversationUseCase.execute(
        { participantIds: payload.participantIds, isGroup: payload.isGroup },
        creatorId,
      );
      return { id: conv.id };
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ [CreateConversation] Error: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('get_messages')
  async handleGetMessages(
    @Payload()
    data: {
      conversationId: string;
      userId: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    try {
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

  @MessagePattern('create_message')
  async handleCreateMessage(
    @Payload() data: CreateMessageDto & { senderId: string },
  ): Promise<CreateMessageResponse> {
    try {
      const { senderId, ...dto } = data;
      const savedMessage = await this.sendMessageUseCase.execute(dto, senderId);

      this.chatGateway.server
        .to(dto.conversationId)
        .emit('new_message', ChatMapper.toDto(savedMessage));

      const conversation = await this.chatRepository.findConversation(
        dto.conversationId,
      );
      if (conversation) {
        conversation.lastMessage =
          savedMessage.content ?? savedMessage.type ?? null;
        conversation.lastMessageAt = savedMessage.createdAt;
        this.chatGateway.server
          .to(dto.conversationId)
          .emit(
            'conversation_updated',
            ChatMapper.conversationToDto(conversation),
          );
      }

      void this.triggerBotReplyUseCase.execute(savedMessage, senderId).then(
        async (result) => {
          if (result.botReply) {
            this.chatGateway.server
              .to(savedMessage.conversationId)
              .emit('new_message', ChatMapper.toDto(result.botReply));

            // Update conversation sidebar with bot reply as lastMessage
            const conversation = await this.chatRepository.findConversation(
              savedMessage.conversationId,
            );
            if (conversation) {
              conversation.lastMessage =
                result.botReply.content ?? result.botReply.type ?? null;
              conversation.lastMessageAt = result.botReply.createdAt;
              this.chatGateway.server
                .to(savedMessage.conversationId)
                .emit(
                  'conversation_updated',
                  ChatMapper.conversationToDto(conversation),
                );
            }
          }
        },
        (err) => {
          this.logger.warn(
            `Bot reply trigger failed: ${(err as Error).message}`,
          );
        },
      );

      return {
        message: ChatMapper.toDto(savedMessage),
      };
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`❌ [CreateMessage] Error: ${error.message}`);
      throw new RpcException(error.message);
    }
  }

  @MessagePattern('get_user_conversations')
  async handleGetUserConversations(
    @Payload() data: { userId: string; limit?: number; cursor?: string },
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

  @EventPattern('ai.stream_token')
  handleStreamToken(
    @Payload() data: { conversationId: string; userId: string; token: string },
  ): void {
    this.chatGateway.server.to(data.conversationId).emit('bot_token', {
      conversationId: data.conversationId,
      token: data.token,
    });
  }
}
