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
import { AnswerCallUseCase } from '../../application/use-cases/answer-call.use-case';
import { ConnectTransportUseCase } from '../../application/use-cases/connect-transport.use-case';
import { ConsumeUseCase } from '../../application/use-cases/consume.use-case';
import { CreateTransportUseCase } from '../../application/use-cases/create-transport.use-case';
import { InitiateCallUseCase } from '../../application/use-cases/initiate-call.use-case';
import { JoinCallUseCase } from '../../application/use-cases/join-call.use-case';
import { LeaveCallUseCase } from '../../application/use-cases/leave-call.use-case';
import { ProduceUseCase } from '../../application/use-cases/produce.use-case';
import { RejectCallUseCase } from '../../application/use-cases/reject-call.use-case';
import { ResumeConsumerUseCase } from '../../application/use-cases/resume-consumer.use-case';
import type { CallSession } from '../../domain/entities/call-session.entity';
import type { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

type InitiateCallPayload = {
  conversationId: string;
  targetUserId: string;
  callType: 'VOICE' | 'VIDEO';
};

type JoinCallPayload = {
  callId: string;
};

type LeaveCallPayload = {
  callId: string;
  reason?: string;
};

type CreateTransportPayload = {
  callId: string;
  direction: 'send' | 'recv';
};

type ConnectTransportPayload = {
  callId: string;
  transportId: string;
  dtlsParameters: Record<string, unknown>;
};

type ProducePayload = {
  callId: string;
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: Record<string, unknown>;
};

type ConsumePayload = {
  callId: string;
  transportId: string;
  producerId: string;
  rtpCapabilities: Record<string, unknown>;
};

type ResumeConsumerPayload = {
  callId: string;
  consumerId: string;
};

@WebSocketGateway({ namespace: '/call', cors: { origin: '*' } })
export class CallGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(CallGateway.name);

  constructor(
    private readonly initiateCallUseCase: InitiateCallUseCase,
    private readonly joinCallUseCase: JoinCallUseCase,
    private readonly createTransportUseCase: CreateTransportUseCase,
    private readonly connectTransportUseCase: ConnectTransportUseCase,
    private readonly produceUseCase: ProduceUseCase,
    private readonly consumeUseCase: ConsumeUseCase,
    private readonly leaveCallUseCase: LeaveCallUseCase,
    private readonly rejectCallUseCase: RejectCallUseCase,
    private readonly answerCallUseCase: AnswerCallUseCase,
    private readonly resumeConsumerUseCase: ResumeConsumerUseCase,
    @Inject('ICallStateRepository')
    private readonly stateRepository: ICallStateRepository,
    @Inject('AUTH_SERVICE_RMQ') private readonly authClient: ClientProxy,
  ) {}

  async handleConnection(client: Socket) {
    const userId = await this.resolveUserId(client);
    if (!userId) {
      client.disconnect(true);
      return;
    }

    await client.join(userId);
    this.logger.log(`Socket connected ${client.id} user=${userId}`);
  }

  async handleDisconnect(client: Socket) {
    const userId = this.getResolvedUserId(client);
    if (!userId) {
      return;
    }

    const callIds = this.getTrackedCallIds(client);
    for (const callId of callIds) {
      try {
        const participant = await this.stateRepository.removeParticipantSocket(
          callId,
          userId,
          client.id,
        );

        if (!participant) {
          continue;
        }

        if (participant.isConnected) {
          continue;
        }

        const result = await this.leaveCallUseCase.execute(
          callId,
          userId,
          'disconnected',
        );
        if (result.shouldEmitPeerLeft) {
          client.to(callId).emit('peer_left', {
            callId,
            userId,
            reason: 'disconnected',
          });
        }
        this.emitCallEnded(result.session, result.endedReason);
      } catch (error) {
        this.logger.warn(
          `Disconnect cleanup failed for call ${callId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  @SubscribeMessage('initiate_call')
  async handleInitiateCall(
    @MessageBody() payload: InitiateCallPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    const result = await this.initiateCallUseCase.execute(
      payload.conversationId,
      userId,
      payload.targetUserId,
      payload.callType,
      client.id,
    );

    await client.join(result.session.callId);
    this.trackCallId(client, result.session.callId);

    client.emit('call_joined', {
      callId: result.session.callId,
      role: result.role,
      session: result.session,
      rtpCapabilities: result.rtpCapabilities,
    });

    this.server.to(result.session.targetUserId).emit('incoming_call', {
      callId: result.session.callId,
      conversationId: result.session.conversationId,
      initiatorId: result.session.initiatorId,
      targetUserId: result.session.targetUserId,
      callType: result.session.callType,
    });
  }

  @SubscribeMessage('join_call')
  async handleJoinCall(
    @MessageBody() payload: JoinCallPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    const result = await this.joinCallUseCase.execute(
      payload.callId,
      userId,
      client.id,
    );

    await client.join(payload.callId);
    this.trackCallId(client, payload.callId);

    client.emit('call_joined', {
      callId: payload.callId,
      role: result.role,
      session: result.session,
      rtpCapabilities: result.rtpCapabilities,
    });

    if (result.shouldEmitNewPeer) {
      client.to(payload.callId).emit('new_peer', {
        callId: payload.callId,
        userId,
      });
    }
  }

  @SubscribeMessage('create_transport')
  async handleCreateTransport(
    @MessageBody() payload: CreateTransportPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    const transport = await this.createTransportUseCase.execute(
      payload.callId,
      userId,
      payload.direction,
    );

    client.emit('transport_created', {
      callId: payload.callId,
      ...transport,
    });
  }

  @SubscribeMessage('connect_transport')
  async handleConnectTransport(
    @MessageBody() payload: ConnectTransportPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    await this.connectTransportUseCase.execute(
      payload.callId,
      userId,
      payload.transportId,
      payload.dtlsParameters,
    );

    client.emit('transport_connected', {
      callId: payload.callId,
      transportId: payload.transportId,
    });
  }

  @SubscribeMessage('produce')
  async handleProduce(
    @MessageBody() payload: ProducePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    const result = await this.produceUseCase.execute(
      payload.callId,
      userId,
      payload.transportId,
      payload.kind,
      payload.rtpParameters,
    );

    client.emit('new_producer', {
      callId: payload.callId,
      userId,
      ...result,
      kind: payload.kind,
    });

    client.to(payload.callId).emit('new_producer', {
      callId: payload.callId,
      userId,
      producerId: result.producerId,
      kind: payload.kind,
    });
  }

  @SubscribeMessage('consume')
  async handleConsume(
    @MessageBody() payload: ConsumePayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    const result = await this.consumeUseCase.execute(
      payload.callId,
      userId,
      payload.transportId,
      payload.producerId,
      payload.rtpCapabilities,
    );

    client.emit('consumer_created', {
      callId: payload.callId,
      ...result,
    });
  }

  @SubscribeMessage('resume_consumer')
  async handleResumeConsumer(
    @MessageBody() payload: ResumeConsumerPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    await this.resumeConsumerUseCase.execute(
      payload.callId,
      userId,
      payload.consumerId,
    );

    client.emit('consumer_resumed', {
      callId: payload.callId,
      consumerId: payload.consumerId,
    });
  }

  @SubscribeMessage('answer_call')
  async handleAnswerCall(
    @MessageBody() payload: JoinCallPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    await this.answerCallUseCase.execute(payload.callId, userId);
    this.server.to(payload.callId).emit('call_answered', {
      callId: payload.callId,
      userId,
    });
  }

  @SubscribeMessage('leave_call')
  async handleLeaveCall(
    @MessageBody() payload: LeaveCallPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    const result = await this.leaveCallUseCase.execute(
      payload.callId,
      userId,
      payload.reason,
    );

    this.untrackCallId(client, payload.callId);
    if (result.shouldEmitPeerLeft) {
      client.to(payload.callId).emit('peer_left', {
        callId: payload.callId,
        userId,
        reason: result.endedReason,
      });
    }
    this.emitCallEnded(result.session, result.endedReason);
  }

  @SubscribeMessage('reject_call')
  async handleRejectCall(
    @MessageBody() payload: LeaveCallPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    await this.rejectCallUseCase.execute(
      payload.callId,
      userId,
      payload.reason,
    );
    this.untrackCallId(client, payload.callId);

    client.to(payload.callId).emit('call_rejected', {
      callId: payload.callId,
      userId,
      reason: payload.reason ?? 'rejected',
    });
  }

  private emitCallEnded(session: CallSession, reason: string): void {
    this.server.to(session.callId).emit('call_ended', {
      callId: session.callId,
      reason,
    });

    if (!session.participantIds.includes(session.targetUserId)) {
      this.server.to(session.targetUserId).emit('call_ended', {
        callId: session.callId,
        reason,
      });
    }
  }

  private trackCallId(client: Socket, callId: string): void {
    const socketData = client.data as Record<string, unknown>;
    const tracked = new Set(this.getTrackedCallIds(client));
    tracked.add(callId);
    socketData['callIds'] = [...tracked];
  }

  private untrackCallId(client: Socket, callId: string): void {
    const socketData = client.data as Record<string, unknown>;
    socketData['callIds'] = this.getTrackedCallIds(client).filter(
      (trackedCallId) => trackedCallId !== callId,
    );
  }

  private getTrackedCallIds(client: Socket): string[] {
    const socketData = client.data as Record<string, unknown>;
    const value = socketData['callIds'];
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private getResolvedUserId(client: Socket): string | null {
    const socketData = client.data as Record<string, unknown>;
    const cachedUserId = socketData['userId'];
    return typeof cachedUserId === 'string' && cachedUserId
      ? cachedUserId
      : null;
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
    const cachedUserId = this.getResolvedUserId(client);
    if (cachedUserId) {
      return cachedUserId;
    }

    const token = this.extractAccessToken(client);
    if (!token) {
      return null;
    }

    const user = await lastValueFrom(
      this.authClient
        .send<AuthUser | null>('auth.verify_token', { token })
        .pipe(
          timeout(5000),
          catchError(() => of(null)),
        ),
      { defaultValue: null },
    );

    if (!user?.id) {
      this.logger.warn(`Socket ${client.id} provided an invalid access token`);
      client.disconnect(true);
      return null;
    }

    const socketData = client.data as Record<string, unknown>;
    socketData['userId'] = user.id;
    return user.id;
  }
}
