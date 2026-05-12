import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JoinRoomUseCase } from '../../application/use-cases/join-room.use-case';
import { CreateTransportUseCase } from '../../application/use-cases/create-transport.use-case';
import { ConnectTransportUseCase } from '../../application/use-cases/connect-transport.use-case';
import { ProduceUseCase } from '../../application/use-cases/produce.use-case';
import { ConsumeUseCase } from '../../application/use-cases/consume.use-case';
import { EndCallUseCase } from '../../application/use-cases/end-call.use-case';
import { RejectCallUseCase } from '../../application/use-cases/reject-call.use-case';
import { AnswerCallUseCase } from '../../application/use-cases/answer-call.use-case';

@WebSocketGateway({ cors: { origin: '*' } })
export class CallGateway {
  @WebSocketServer() server: Server;

  constructor(
    private readonly joinRoomUseCase: JoinRoomUseCase,
    private readonly createTransportUseCase: CreateTransportUseCase,
    private readonly connectTransportUseCase: ConnectTransportUseCase,
    private readonly produceUseCase: ProduceUseCase,
    private readonly consumeUseCase: ConsumeUseCase,
    private readonly endCallUseCase: EndCallUseCase,
    private readonly rejectCallUseCase: RejectCallUseCase,
    private readonly answerCallUseCase: AnswerCallUseCase,
  ) {}

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @MessageBody() payload: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    if (!userId) return;

    await client.join(payload.roomId);
    const session = await this.joinRoomUseCase.execute(
      payload.roomId,
      userId,
      client.id,
    );
    client.emit('room-joined', { roomId: payload.roomId, session });
  }

  @SubscribeMessage('create-transport')
  async handleCreateTransport(
    @MessageBody() payload: { roomId: string; direction: 'send' | 'recv' },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    if (!userId) return;

    const transport = await this.createTransportUseCase.execute(
      payload.roomId,
      userId,
      payload.direction,
    );
    client.emit('transport-created', {
      ...transport,
      roomId: payload.roomId,
      userId,
    });
  }

  @SubscribeMessage('transport-connect')
  async handleTransportConnect(
    @MessageBody()
    payload: {
      roomId: string;
      transportId: string;
      dtlsParameters: Record<string, unknown>;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    if (!userId) return;

    await this.connectTransportUseCase.execute(
      payload.roomId,
      userId,
      payload.transportId,
      payload.dtlsParameters,
    );
    client.emit('transport-connected', { transportId: payload.transportId });
  }

  @SubscribeMessage('produce')
  async handleProduce(
    @MessageBody()
    payload: {
      roomId: string;
      transportId: string;
      kind: 'audio' | 'video';
      rtpParameters: Record<string, unknown>;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    if (!userId) return;

    const result = await this.produceUseCase.execute(
      payload.roomId,
      userId,
      payload.transportId,
      payload.kind,
      payload.rtpParameters,
    );
    client.emit('produced', result);
  }

  @SubscribeMessage('consume')
  async handleConsume(
    @MessageBody() payload: { roomId: string; producerId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    if (!userId) return;

    const result = await this.consumeUseCase.execute(
      payload.roomId,
      userId,
      payload.producerId,
    );
    client.emit('consumed', result);
  }

  @SubscribeMessage('answer-call')
  async handleAnswerCall(
    @MessageBody() payload: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    if (!userId) return;

    await this.answerCallUseCase.execute(payload.roomId, userId);
    client.emit('call-answered', { roomId: payload.roomId });
  }

  @SubscribeMessage('end-call')
  async handleEndCall(
    @MessageBody() payload: { roomId: string; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    if (!userId) return;

    await this.endCallUseCase.execute(payload.roomId, userId, payload.reason);
    client.emit('call-ended', { roomId: payload.roomId });
  }

  @SubscribeMessage('reject-call')
  async handleRejectCall(
    @MessageBody() payload: { roomId: string; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = this.extractUserId(client);
    if (!userId) return;

    await this.rejectCallUseCase.execute(
      payload.roomId,
      userId,
      payload.reason,
    );
    client.emit('call-rejected', { roomId: payload.roomId });
  }

  private extractUserId(client: Socket): string | null {
    const userId = client.handshake.query?.['userId'];
    if (Array.isArray(userId)) return userId[0];
    return userId || null;
  }
}
