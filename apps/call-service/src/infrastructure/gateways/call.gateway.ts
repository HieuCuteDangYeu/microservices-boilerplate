import type { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { ForbiddenException, Inject, Logger, NotFoundException } from '@nestjs/common';
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
import { CallParticipant } from '../../domain/entities/call-participant.entity';
import type { ICallMediaEngine } from '../../domain/interfaces/call-media.engine.interface';
import type { CallSession } from '../../domain/entities/call-session.entity';
import type { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';
import type { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

type InitiateCallPayload = {
  conversationId: string;
  targetUserId: string;
  callType: 'VOICE' | 'VIDEO';
};

type JoinCallPayload = {
  callId: string;
};

type RejoinCallPayload = {
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

@WebSocketGateway({
  namespace: '/call',
  cors: { origin: '*' },
  // Keep disconnect detection tight so the connected peer enters reconnecting quickly.
  pingInterval: 5000,
  pingTimeout: 5000,
})
export class CallGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private readonly logger = new Logger(CallGateway.name);
  private readonly reconnectGraceMs = Number(
    process.env.CALL_RECONNECT_GRACE_MS || 15000,
  );
  private readonly pendingDisconnects = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

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
    @Inject('ICallMediaEngine')
    private readonly mediaEngine: ICallMediaEngine,
    @Inject('ICallSessionRepository')
    private readonly sessionRepository: ICallSessionRepository,
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
        const session = await this.sessionRepository.findByCallId(callId);
        if (!session) {
          continue;
        }

        const participant = await this.stateRepository.getParticipant(
          callId,
          userId,
        );

        if (!participant) {
          continue;
        }

        const remainingSocketIds = participant.socketIds.filter(
          (socketId) => socketId !== client.id,
        );

        if (remainingSocketIds.length > 0) {
          await this.stateRepository.upsertParticipant(
            new CallParticipant({
              ...participant,
              socketId: remainingSocketIds[0],
              socketIds: remainingSocketIds,
              isConnected: true,
              reconnectDeadlineAt: undefined,
            }),
          );
          continue;
        }

        if (session.status === 'active') {
          const reconnectDeadlineAt = new Date(
            Date.now() + this.reconnectGraceMs,
          );
          await this.stateRepository.upsertParticipant(
            new CallParticipant({
              ...participant,
              socketIds: [],
              socketId: undefined,
              isConnected: false,
              reconnectDeadlineAt,
            }),
          );
          this.server.to(callId).emit('peer_reconnecting', {
            callId,
            userId,
            reconnectDeadlineAt: reconnectDeadlineAt.toISOString(),
          });
          this.scheduleDisconnectFinalization(callId, userId);
          continue;
        }

        await this.stateRepository.removeParticipant(callId, userId);
        const result = await this.leaveCallUseCase.execute(
          callId,
          userId,
          'disconnected',
        );
        if (result.shouldEmitPeerLeft) {
          this.server.to(callId).emit('peer_left', {
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

  @SubscribeMessage('rejoin_call')
  async handleRejoinCall(
    @MessageBody() payload: RejoinCallPayload,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = await this.resolveUserId(client);
    if (!userId) return;

    const session = await this.sessionRepository.findByCallId(payload.callId);
    if (!session) {
      throw new NotFoundException('Call not found');
    }

    if (session.status !== 'active') {
      throw new ForbiddenException('Call is not recoverable');
    }

    const participant = await this.stateRepository.getParticipant(
      payload.callId,
      userId,
    );
    if (!participant) {
      throw new ForbiddenException('You are not part of this call');
    }

    if (
      !participant.isConnected &&
      (!participant.reconnectDeadlineAt ||
        participant.reconnectDeadlineAt.getTime() <= Date.now())
    ) {
      throw new ForbiddenException('Reconnect window expired');
    }

    const result = await this.joinCallUseCase.execute(
      payload.callId,
      userId,
      client.id,
    );

    await client.join(payload.callId);
    this.trackCallId(client, payload.callId);
    this.clearPendingDisconnect(payload.callId, userId);

    client.emit('call_rejoined', {
      callId: payload.callId,
      role: result.role,
      session: result.session,
      rtpCapabilities: result.rtpCapabilities,
    });

    client.to(payload.callId).emit('peer_reconnected', {
      callId: payload.callId,
      userId,
    });

    const activePeerProducers = await this.mediaEngine.listActiveProducers(
      payload.callId,
      userId,
    );

    activePeerProducers.forEach((producer) => {
      client.emit('new_producer', {
        callId: payload.callId,
        userId: producer.userId,
        producerId: producer.producerId,
        kind: producer.kind,
      });
    });
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

    this.clearPendingDisconnect(payload.callId, userId);
    this.untrackCallId(client, payload.callId);
    if (result.shouldEmitPeerLeft) {
      this.server.to(payload.callId).emit('peer_left', {
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
    this.clearPendingDisconnect(payload.callId, userId);
    this.untrackCallId(client, payload.callId);

    client.to(payload.callId).emit('call_rejected', {
      callId: payload.callId,
      userId,
      reason: payload.reason ?? 'rejected',
    });
  }

  private emitCallEnded(session: CallSession, reason: string): void {
    this.clearPendingDisconnect(session.callId, session.initiatorId);
    this.clearPendingDisconnect(session.callId, session.targetUserId);
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

  private scheduleDisconnectFinalization(callId: string, userId: string): void {
    this.clearPendingDisconnect(callId, userId);

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const participant = await this.stateRepository.getParticipant(
            callId,
            userId,
          );

          if (
            !participant ||
            participant.isConnected ||
            !participant.reconnectDeadlineAt ||
            participant.reconnectDeadlineAt.getTime() > Date.now()
          ) {
            return;
          }

          await this.stateRepository.removeParticipant(callId, userId);
          const result = await this.leaveCallUseCase.execute(
            callId,
            userId,
            'disconnected',
          );
          if (result.shouldEmitPeerLeft) {
            this.server.to(callId).emit('peer_left', {
              callId,
              userId,
              reason: 'disconnected',
            });
          }
          this.emitCallEnded(result.session, result.endedReason);
        } catch (error) {
          this.logger.warn(
            `Deferred disconnect cleanup failed for call ${callId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        } finally {
          this.clearPendingDisconnect(callId, userId);
        }
      })();
    }, this.reconnectGraceMs);

    this.pendingDisconnects.set(this.disconnectKey(callId, userId), timeoutId);
  }

  private clearPendingDisconnect(callId: string, userId: string): void {
    const key = this.disconnectKey(callId, userId);
    const timeoutId = this.pendingDisconnects.get(key);
    if (!timeoutId) {
      return;
    }

    clearTimeout(timeoutId);
    this.pendingDisconnects.delete(key);
  }

  private disconnectKey(callId: string, userId: string): string {
    return `${callId}:${userId}`;
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
