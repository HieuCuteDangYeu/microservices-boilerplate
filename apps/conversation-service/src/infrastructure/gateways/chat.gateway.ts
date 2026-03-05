import { CreateMessageDto } from '@common/conversation/dtos/create-message.dto';
import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { IChatRepository } from 'apps/conversation-service/src/domain/interfaces/chat.repository.interface';
import { Server, Socket } from 'socket.io'; // Import đúng type của Socket.io
import { SendMessageUseCase } from '../../application/use-cases/send-message.use-case';

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(
    private readonly sendMessageUseCase: SendMessageUseCase,
    @Inject('IChatRepository') private readonly chatRepository: IChatRepository,
  ) {}

  // --- 1. HANDLE CONNECTION ---
  handleConnection(client: Socket) {
    const userId = this.extractUserId(client);

    if (userId) {
      void client.join(userId);
      console.log(`Client connected: ${client.id} (User: ${userId})`);
    } else {
      // Tùy logic: Có thể disconnect nếu không có userId
      // client.disconnect();
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

    // ✅ TẠO MESSAGE TẠM (optimistic)
    const tempMessage = {
      id: crypto.randomUUID(),
      conversationId: payload.conversationId,
      senderId,
      content: payload.content,
      type: payload.type,
      signalType: payload.signalType,
      createdAt: new Date(),
      status: 'sending',
    };

    this.server.to(payload.conversationId).emit('new_message', tempMessage);

    this.sendMessageUseCase
      .execute(payload, senderId)
      .then(({ message, conversation }) => {
        // optional: emit ack / sync lại ID thật
        this.server.to(payload.conversationId).emit('message_synced', message);

        conversation.participantIds.forEach((id) => {
          this.server.to(id).emit('conversation_updated', conversation);
        });
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
  // Sử dụng 'any' có kiểm soát hoặc tạo DTO riêng cho WebRTC signal
  @SubscribeMessage('offer')
  handleOffer(
    @MessageBody() data: Record<string, any>,
    @ConnectedSocket() client: Socket,
  ) {
    this.relaySignal(client, 'offer', data);
  }

  @SubscribeMessage('answer')
  handleAnswer(
    @MessageBody() data: Record<string, any>,
    @ConnectedSocket() client: Socket,
  ) {
    this.relaySignal(client, 'answer', data);
  }

  @SubscribeMessage('ice_candidate')
  handleIceCandidate(
    @MessageBody() data: Record<string, any>,
    @ConnectedSocket() client: Socket,
  ) {
    this.relaySignal(client, 'ice_candidate', data);
  }

  // --- 5. TYPING INDICATOR ---
  @SubscribeMessage('typing_start')
  handleTypingStart(
    @MessageBody() conversationId: string, // Nhận vào ID phòng
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);

    // Gửi cho tất cả mọi người trong phòng TRỪ người gửi (client.to)
    // Client nhận được sẽ hiện: "User A đang soạn tin..."
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

    // Gửi thông báo dừng gõ
    client.to(conversationId).emit('user_typing', {
      conversationId,
      userId,
      isTyping: false,
    });
  }

  // --- PRIVATE HELPER FUNCTIONS (Để code gọn và Type Safe) ---

  /**
   * Helper chuyển tiếp tín hiệu WebRTC an toàn
   */
  private relaySignal(
    client: Socket,
    event: string,
    data: Record<string, any>,
  ) {
    const toUserId = String(data['toUserId']); // Truy cập an toàn qua string key
    if (toUserId) {
      const senderId = this.extractUserId(client);
      client.to(toUserId).emit(event, { ...data, fromUserId: senderId });
    }
  }

  /**
   * Helper lấy userId từ query string đảm bảo trả về string | null
   */
  private extractUserId(client: Socket): string | null {
    // handshake.query có thể là ParsedUrlQuery, truy cập an toàn
    const userId = client.handshake.query?.['userId'];

    if (Array.isArray(userId)) {
      return userId[0];
    }
    return userId || null;
  }

  /**
   * Helper xử lý Error object an toàn (Tránh lỗi Unsafe member access)
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'An unknown error occurred';
  }

  @SubscribeMessage('mark_seen')
  async handleMarkSeen(
    @MessageBody() conversationId: string, // Hoặc object { conversationId: string } tuỳ client gửi
    @ConnectedSocket() client: Socket,
  ) {
    // Lưu ý: Nếu client gửi json { conversationId: "..." } thì @MessageBody() conversationId sẽ là object
    // Bạn nên check lại log xem payload là string hay object nhé.
    // Giả sử client gửi string conversationId.

    const userId = this.extractUserId(client);
    if (!userId) return;

    // 1. Gọi Repo và LẤY KẾT QUẢ
    const updatedCount = await this.chatRepository.markMessagesAsSeen(
      conversationId,
      userId,
    );

    // 2. Kiểm tra count > 0 mới bắn Socket
    if (updatedCount > 0) {
      // Báo cho người kia biết
      client.to(conversationId).emit('messages_seen', {
        conversationId,
        readByUserId: userId,
        at: new Date(),
      });
      console.log(
        `✅ [Socket] Emitted messages_seen to room ${conversationId}`,
      );
    } else {
      console.log(
        `⚠️ [Socket] Skipped emit messages_seen (DB updated 0 records)`,
      );
    }
  }
}
