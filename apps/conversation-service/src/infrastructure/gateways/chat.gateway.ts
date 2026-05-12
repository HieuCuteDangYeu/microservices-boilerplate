import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';
import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';
import { TriggerBotReplyUseCase } from '../../application/use-cases/trigger-bot-reply.use-case';
import { Message } from '../../domain/entities/message.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import { ChatMapper } from '../repositories/chat.mapper';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly triggerBotReplyUseCase: TriggerBotReplyUseCase,
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
  ) {}

  // --- 1. HANDLE CONNECTION ---
  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);
    if (userId) {
      void client.join(userId);
      console.log(`Client connected: ${client.id} (User: ${userId})`);
    }
  }

  // --- 2. HANDLE DISCONNECT ---
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // --- 3. HANDLE MESSAGE (CORE) ---
  @SubscribeMessage('send_message')
  handleMessage(
    @MessageBody() payload: CreateMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = this.extractUserId(client);
    if (!senderId) return;

    const tempMessage = {
      id: crypto.randomUUID(),
      conversationId: payload.conversationId,
      senderId,
      content: payload.content,
      type: payload.type,
      signalType: payload.signalType,
      replyToId: payload.replyToId,
      createdAt: new Date(),
      status: 'sending',
    };

    this.server.to(payload.conversationId).emit('new_message', tempMessage);

    this.sendMessageUseCase
      .execute(payload, senderId)
      .then(async (savedMessage: Message) => {
        this.server
          .to(payload.conversationId)
          .emit('message_synced', ChatMapper.toDto(savedMessage));

        // Update conversation sidebar for all participants (lastMessage, ordering)
        const conversation = await this.chatRepository.findConversation(
          payload.conversationId,
        );
        if (conversation) {
          conversation.lastMessage =
            savedMessage.content ?? savedMessage.type ?? null;
          conversation.lastMessageAt = savedMessage.createdAt;
          this.server
            .to(payload.conversationId)
            .emit(
              'conversation_updated',
              ChatMapper.conversationToDto(conversation),
            );
        }

        void this.triggerBotReplyUseCase.execute(savedMessage, senderId).then(
          async (result) => {
            if (result.botReply) {
              this.server
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
                this.server
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
      })
      .catch(() => {
        this.server.to(client.id).emit('message_failed', tempMessage.id);
      });
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    void client.join(conversationId);
    console.log(`Client ${client.id} joined room ${conversationId}`);
  }

  // --- 4. WEBRTC SIGNALING ---
  @SubscribeMessage('offer')
  handleOffer(
    @MessageBody() data: Record<string, unknown>,
    @ConnectedSocket() client: Socket,
  ) {
    this.relaySignal(client, 'offer', data);
  }

  @SubscribeMessage('answer')
  handleAnswer(
    @MessageBody() data: Record<string, unknown>,
    @ConnectedSocket() client: Socket,
  ) {
    this.relaySignal(client, 'answer', data);
  }

  @SubscribeMessage('ice_candidate')
  handleIceCandidate(
    @MessageBody() data: Record<string, unknown>,
    @ConnectedSocket() client: Socket,
  ) {
    this.relaySignal(client, 'ice_candidate', data);
  }

  // --- 5. TYPING INDICATOR ---
  @SubscribeMessage('typing_start')
  handleTypingStart(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    client.to(conversationId).emit('user_typing', {
      conversationId,
      userId,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    client.to(conversationId).emit('user_typing', {
      conversationId,
      userId,
      isTyping: false,
    });
  }

  // --- PRIVATE HELPERS ---
  private relaySignal(
    client: Socket,
    event: string,
    data: Record<string, unknown>,
  ): void {
    const toUserId = String(data['toUserId']);
    if (toUserId) {
      const senderId = this.extractUserId(client);
      client.to(toUserId).emit(event, { ...data, fromUserId: senderId });
    }
  }

  private extractUserId(client: Socket): string | null {
    const userId = client.handshake.query?.['userId'];
    if (Array.isArray(userId)) {
      return userId[0];
    }
    return userId || null;
  }

  @SubscribeMessage('mark_seen')
  async handleMarkSeen(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    if (!userId) return;

    const updatedCount = await this.chatRepository.markMessagesAsSeen(
      conversationId,
      userId,
    );

    if (updatedCount > 0) {
      client.to(conversationId).emit('messages_seen', {
        conversationId,
        readByUserId: userId,
        at: new Date(),
      });
      console.log(
        `✅ [Socket] Emitted messages_seen to room ${conversationId}`,
      );
    }
  }
}
