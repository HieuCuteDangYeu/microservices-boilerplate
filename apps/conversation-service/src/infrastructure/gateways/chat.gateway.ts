import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';
import type { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { catchError, lastValueFrom, of, timeout } from 'rxjs';
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
    @Inject('AUTH_SERVICE_RMQ') private readonly authClient: ClientProxy,
  ) {}

  // --- 1. HANDLE CONNECTION ---
  async handleConnection(client: Socket) {
    const userId = await this.resolveUserId(client);
    if (userId) {
      void client.join(userId);
      console.log(`Client connected: ${client.id} (User: ${userId})`);
      return;
    }

    client.disconnect(true);
  }

  // --- 2. HANDLE DISCONNECT ---
  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // --- 3. HANDLE MESSAGE (CORE) ---
  @SubscribeMessage('send_message')
  async handleMessage(
    @MessageBody() payload: CreateMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = await this.resolveUserId(client);
    if (!senderId) return;

    try {
      await this.chatRepository.assertConversationParticipant(
        payload.conversationId,
        senderId,
      );
    } catch (error) {
      this.logger.warn(
        `Rejected send_message for socket ${client.id}: ${(error as Error).message}`,
      );
      this.server.to(client.id).emit('message_failed', {
        conversationId: payload.conversationId,
        clientMessageId: payload.clientMessageId,
      });
      return;
    }

    const tempMessage = {
      id: crypto.randomUUID(),
      conversationId: payload.conversationId,
      senderId,
      clientMessageId: payload.clientMessageId,
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
        this.server.to(client.id).emit('message_failed', {
          conversationId: payload.conversationId,
          clientMessageId: payload.clientMessageId,
        });
      });
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    try {
      await this.chatRepository.assertConversationParticipant(
        conversationId,
        userId,
      );
    } catch (error) {
      this.logger.warn(
        `Rejected join_conversation for socket ${client.id}: ${(error as Error).message}`,
      );
      return;
    }

    void client.join(conversationId);
    console.log(`Client ${client.id} joined room ${conversationId}`);
  }

  // --- 4. WEBRTC SIGNALING ---
  @SubscribeMessage('offer')
  async handleOffer(
    @MessageBody() data: Record<string, unknown>,
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = await this.resolveUserId(client);
    this.relaySignal(client, 'offer', data, senderId);
  }

  @SubscribeMessage('answer')
  async handleAnswer(
    @MessageBody() data: Record<string, unknown>,
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = await this.resolveUserId(client);
    this.relaySignal(client, 'answer', data, senderId);
  }

  @SubscribeMessage('ice_candidate')
  async handleIceCandidate(
    @MessageBody() data: Record<string, unknown>,
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = await this.resolveUserId(client);
    this.relaySignal(client, 'ice_candidate', data, senderId);
  }

  // --- 5. TYPING INDICATOR ---
  @SubscribeMessage('typing_start')
  async handleTypingStart(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    try {
      await this.chatRepository.assertConversationParticipant(
        conversationId,
        userId,
      );
    } catch (error) {
      this.logger.warn(
        `Rejected typing_start for socket ${client.id}: ${(error as Error).message}`,
      );
      return;
    }

    client.to(conversationId).emit('user_typing', {
      conversationId,
      userId,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    try {
      await this.chatRepository.assertConversationParticipant(
        conversationId,
        userId,
      );
    } catch (error) {
      this.logger.warn(
        `Rejected typing_stop for socket ${client.id}: ${(error as Error).message}`,
      );
      return;
    }

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
    senderId: string | null,
  ): void {
    const toUserId = String(data['toUserId']);
    if (toUserId && senderId) {
      client.to(toUserId).emit(event, { ...data, fromUserId: senderId });
    }
  }

  private extractAccessToken(client: Socket): string | null {
    const handshakeAuth = client.handshake.auth as
      | Record<string, unknown>
      | undefined;
    const authToken = handshakeAuth?.['token'];
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken;
    }

    const authHeader = client.handshake.headers['authorization'];
    if (typeof authHeader === 'string') {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) {
        return token;
      }
    }

    const cookieHeader = client.handshake.headers.cookie;
    if (typeof cookieHeader !== 'string') {
      return null;
    }

    const accessTokenCookie = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('access_token='));

    if (!accessTokenCookie) {
      return null;
    }

    return decodeURIComponent(accessTokenCookie.slice('access_token='.length));
  }

  private async resolveUserId(client: Socket): Promise<string | null> {
    const socketData = client.data as Record<string, unknown>;
    const cachedUserId = socketData['userId'];
    if (typeof cachedUserId === 'string' && cachedUserId) {
      return cachedUserId;
    }

    const token = this.extractAccessToken(client);
    if (token) {
      const user = await lastValueFrom(
        this.authClient
          .send<AuthUser | null>('auth.verify_token', { token })
          .pipe(
            timeout(5000),
            catchError(() => of(null)),
          ),
        { defaultValue: null },
      );

      if (user?.id) {
        socketData['userId'] = user.id;
        return user.id;
      }

      this.logger.warn(`Socket ${client.id} provided an invalid access token`);
      client.disconnect(true);
      return null;
    }

    return null;
  }

  @SubscribeMessage('mark_seen')
  async handleMarkSeen(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
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
