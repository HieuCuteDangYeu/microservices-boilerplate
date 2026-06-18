import { of, throwError } from 'rxjs';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { CallGateway } from '../src/infrastructure/gateways/call.gateway';
import { CallServiceModule } from '../src/call-service.module';
import type { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import type {
  ActiveProducerResult,
  ConsumedMediaResult,
  CreateRecvTransportResult,
  CreateSendTransportResult,
  ProducedMediaResult,
  RouterRtpCapabilitiesResult,
} from '../src/domain/interfaces/call-media.engine.interface';

type RoomState = {
  transports: Map<
    string,
    {
      userId: string;
      direction: 'send' | 'recv';
      connected: boolean;
      closed: boolean;
    }
  >;
  producers: Map<
    string,
    {
      userId: string;
      transportId: string;
      kind: 'audio' | 'video';
      closed: boolean;
    }
  >;
  consumers: Map<
    string,
    {
      userId: string;
      transportId: string;
      producerId: string;
      paused: boolean;
      closed: boolean;
    }
  >;
};

class FakeRedisClient {
  private readonly values = new Map<string, string>();
  private readonly hashes = new Map<string, Map<string, string>>();
  private readonly sets = new Map<string, Set<string>>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  set(key: string, value: string): Promise<'OK'> {
    this.values.set(key, value);
    return Promise.resolve('OK');
  }

  del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      deleted += Number(this.values.delete(key));
      deleted += Number(this.hashes.delete(key));
      deleted += Number(this.sets.delete(key));
    }
    return Promise.resolve(deleted);
  }

  hset(key: string, field: string, value: string): Promise<number> {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    hash.set(field, value);
    this.hashes.set(key, hash);
    return Promise.resolve(1);
  }

  hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    return Promise.resolve(Object.fromEntries(hash.entries()));
  }

  hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashes.get(key);
    return Promise.resolve(hash?.get(field) ?? null);
  }

  hdel(key: string, field: string): Promise<number> {
    const hash = this.hashes.get(key);
    if (!hash) return Promise.resolve(0);
    const deleted = hash.delete(field) ? 1 : 0;
    if (hash.size === 0) {
      this.hashes.delete(key);
    }
    return Promise.resolve(deleted);
  }

  expire(): Promise<number> {
    return Promise.resolve(1);
  }

  sadd(key: string, ...members: string[]): Promise<number> {
    const set = this.sets.get(key) ?? new Set<string>();
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added += 1;
      }
    }
    this.sets.set(key, set);
    return Promise.resolve(added);
  }

  smembers(key: string): Promise<string[]> {
    return Promise.resolve([...(this.sets.get(key) ?? new Set<string>())]);
  }

  ping(): Promise<'PONG'> {
    return Promise.resolve('PONG');
  }

  reset(): void {
    this.values.clear();
    this.hashes.clear();
    this.sets.clear();
  }
}

class FakeCallEventPublisher {
  readonly events: Array<{ event: string; payload: Record<string, unknown> }> =
    [];

  publish(event: string, payload: Record<string, unknown>): Promise<void> {
    this.events.push({ event, payload });
    return Promise.resolve();
  }

  reset(): void {
    this.events.length = 0;
  }
}

class FakeAuthClient {
  constructor(private readonly usersByToken: Record<string, AuthUser>) {}

  send(pattern: string, payload: { token: string }) {
    if (pattern !== 'auth.verify_token') {
      return of(null);
    }

    return of(this.usersByToken[payload.token] ?? null);
  }
}

type ConversationDetail = {
  id: string;
  participantIds: string[];
  isGroup: boolean;
};

class FakeConversationClient {
  constructor(
    private readonly conversationsById: Record<string, ConversationDetail>,
  ) {}

  send(pattern: string, payload: { id: string; userId: string }) {
    if (pattern !== 'get_conversation_detail') {
      return of(null);
    }

    const conversation = this.conversationsById[payload.id];
    if (!conversation) {
      return throwError(() => new Error('Conversation not found'));
    }

    if (!conversation.participantIds.includes(payload.userId)) {
      return throwError(
        () => new Error('You are not a participant of this conversation'),
      );
    }

    return of(conversation);
  }
}

class FakeCallMediaEngine {
  private roomCounter = 0;
  private transportCounter = 0;
  private producerCounter = 0;
  private consumerCounter = 0;
  private readonly rooms = new Map<string, RoomState>();

  createRoom(callId: string): Promise<void> {
    if (!this.rooms.has(callId)) {
      this.roomCounter += 1;
      this.rooms.set(callId, {
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });
    }
    return Promise.resolve();
  }

  getRouterRtpCapabilities(): Promise<RouterRtpCapabilitiesResult> {
    return Promise.resolve({
      codecs: [{ mimeType: 'audio/opus' }, { mimeType: 'video/VP8' }],
      headerExtensions: [{ uri: 'urn:ietf:params:rtp-hdrext:sdes:mid' }],
    });
  }

  createSendTransport(
    callId: string,
    userId: string,
  ): Promise<CreateSendTransportResult> {
    return this.createTransport(callId, userId, 'send');
  }

  createRecvTransport(
    callId: string,
    userId: string,
  ): Promise<CreateRecvTransportResult> {
    return this.createTransport(callId, userId, 'recv');
  }

  connectTransport(
    callId: string,
    userId: string,
    transportId: string,
  ): Promise<void> {
    const room = this.getRoom(callId);
    const transport = room.transports.get(transportId);
    if (!transport || transport.userId !== userId) {
      throw new Error('Transport not found');
    }
    transport.connected = true;
    return Promise.resolve();
  }

  produce(
    callId: string,
    userId: string,
    transportId: string,
    kind: 'audio' | 'video',
  ): Promise<ProducedMediaResult> {
    const room = this.getRoom(callId);
    const transport = room.transports.get(transportId);
    if (
      !transport ||
      transport.userId !== userId ||
      transport.direction !== 'send' ||
      !transport.connected
    ) {
      throw new Error('Send transport is not connected');
    }

    this.producerCounter += 1;
    const producerId = `producer-${this.producerCounter}`;
    room.producers.set(producerId, {
      userId,
      transportId,
      kind,
      closed: false,
    });
    return Promise.resolve({ producerId });
  }

  consume(
    callId: string,
    userId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: Record<string, unknown>,
  ): Promise<ConsumedMediaResult> {
    const room = this.getRoom(callId);
    const transport = room.transports.get(transportId);
    if (
      !transport ||
      transport.userId !== userId ||
      transport.direction !== 'recv' ||
      !transport.connected
    ) {
      throw new Error('Receive transport is not connected');
    }

    if (
      !Array.isArray(rtpCapabilities.codecs) ||
      rtpCapabilities.codecs.length === 0
    ) {
      throw new Error('Cannot consume producer with provided RTP capabilities');
    }

    const producer = room.producers.get(producerId);
    if (!producer || producer.closed) {
      throw new Error('Producer not found');
    }

    this.consumerCounter += 1;
    const consumerId = `consumer-${this.consumerCounter}`;
    room.consumers.set(consumerId, {
      userId,
      transportId,
      producerId,
      paused: true,
      closed: false,
    });

    return Promise.resolve({
      consumerId,
      producerId,
      kind: producer.kind,
      rtpParameters: { codecs: rtpCapabilities.codecs },
    });
  }

  resumeConsumer(
    callId: string,
    userId: string,
    consumerId: string,
  ): Promise<void> {
    const room = this.getRoom(callId);
    const consumer = room.consumers.get(consumerId);
    if (!consumer || consumer.userId !== userId || consumer.closed) {
      throw new Error('Consumer not found');
    }
    consumer.paused = false;
    return Promise.resolve();
  }

  listActiveProducers(
    callId: string,
    excludingUserId?: string,
  ): Promise<ActiveProducerResult[]> {
    const room = this.getRoom(callId);

    return Promise.resolve(
      [...room.producers.entries()]
        .filter(([, producer]) => !producer.closed)
        .map(([producerId, producer]) => ({
          producerId,
          userId: producer.userId,
          kind: producer.kind,
        }))
        .filter((producer) =>
          excludingUserId ? producer.userId !== excludingUserId : true,
        ),
    );
  }

  closeRoom(callId: string): Promise<void> {
    const room = this.rooms.get(callId);
    if (!room) return Promise.resolve();

    for (const transport of room.transports.values()) {
      transport.closed = true;
    }
    for (const producer of room.producers.values()) {
      producer.closed = true;
    }
    for (const consumer of room.consumers.values()) {
      consumer.closed = true;
    }
    this.rooms.delete(callId);
    return Promise.resolve();
  }

  getRoomState(callId: string): RoomState | undefined {
    return this.rooms.get(callId);
  }

  getConsumerState(callId: string, consumerId: string) {
    return this.rooms.get(callId)?.consumers.get(consumerId);
  }

  reset(): void {
    this.rooms.clear();
    this.roomCounter = 0;
    this.transportCounter = 0;
    this.producerCounter = 0;
    this.consumerCounter = 0;
  }

  private createTransport(
    callId: string,
    userId: string,
    direction: 'send',
  ): Promise<CreateSendTransportResult>;
  private createTransport(
    callId: string,
    userId: string,
    direction: 'recv',
  ): Promise<CreateRecvTransportResult>;
  private createTransport(
    callId: string,
    userId: string,
    direction: 'send' | 'recv',
  ): Promise<CreateSendTransportResult | CreateRecvTransportResult> {
    const room = this.getRoom(callId);
    this.transportCounter += 1;
    const transportId = `transport-${this.transportCounter}`;
    room.transports.set(transportId, {
      userId,
      direction,
      connected: false,
      closed: false,
    });

    return Promise.resolve({
      transportId,
      direction,
      iceParameters: { usernameFragment: `${transportId}-ufrag` },
      iceCandidates: [{ foundation: `${transportId}-candidate` }],
      dtlsParameters: {
        fingerprints: [{ algorithm: 'sha-256', value: 'test' }],
      },
    });
  }

  private getRoom(callId: string): RoomState {
    const room = this.rooms.get(callId);
    if (!room) {
      throw new Error('Call room not found');
    }
    return room;
  }
}

describe('Call Service P0 flow (e2e)', () => {
  const callerUser: AuthUser = {
    id: 'caller-user',
    email: 'caller@example.com',
    roles: ['USER'],
  };
  const calleeUser: AuthUser = {
    id: 'callee-user',
    email: 'callee@example.com',
    roles: ['USER'],
  };
  const outsiderUser: AuthUser = {
    id: 'outsider-user',
    email: 'outsider@example.com',
    roles: ['USER'],
  };
  const validRtpCapabilities = {
    codecs: [{ mimeType: 'audio/opus' }, { mimeType: 'video/VP8' }],
    headerExtensions: [{ uri: 'urn:ietf:params:rtp-hdrext:sdes:mid' }],
  };

  let app: INestApplication;
  let moduleRef: TestingModule;
  let gateway: CallGateway;
  let redis: FakeRedisClient;
  let eventPublisher: FakeCallEventPublisher;
  let mediaEngine: FakeCallMediaEngine;
  let baseUrl: string;
  const sockets: Socket[] = [];
  const originalReconnectGraceMs = process.env.CALL_RECONNECT_GRACE_MS;
  const originalNoAnswerTimeoutMs = process.env.CALL_NO_ANSWER_TIMEOUT_MS;

  beforeEach(async () => {
    process.env.CALL_RECONNECT_GRACE_MS = '50';
    process.env.CALL_NO_ANSWER_TIMEOUT_MS = '50';
    redis = new FakeRedisClient();
    eventPublisher = new FakeCallEventPublisher();
    mediaEngine = new FakeCallMediaEngine();

    moduleRef = await Test.createTestingModule({
      imports: [CallServiceModule],
    })
      .overrideProvider('REDIS_CLIENT')
      .useValue(redis)
      .overrideProvider('AUTH_SERVICE_RMQ')
      .useValue(
        new FakeAuthClient({
          'caller-token': callerUser,
          'callee-token': calleeUser,
          'outsider-token': outsiderUser,
        }),
      )
      .overrideProvider('CONVERSATION_SERVICE_RMQ')
      .useValue(
        new FakeConversationClient({
          'conv-happy-path': {
            id: 'conv-happy-path',
            participantIds: [callerUser.id, calleeUser.id],
            isGroup: false,
          },
          'conv-active': {
            id: 'conv-active',
            participantIds: [callerUser.id, calleeUser.id],
            isGroup: false,
          },
          'conv-cancel': {
            id: 'conv-cancel',
            participantIds: [callerUser.id, calleeUser.id],
            isGroup: false,
          },
        }),
      )
      .overrideProvider('ICallEventPublisher')
      .useValue(eventPublisher)
      .overrideProvider('ICallMediaEngine')
      .useValue(mediaEngine)
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);

    const httpServer = app.getHttpServer() as {
      address(): AddressInfo | string | null;
    };
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not return a usable address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    gateway = app.get(CallGateway);
  });

  afterEach(async () => {
    await Promise.all(
      sockets.map(
        (socket) =>
          new Promise<void>((resolve) => {
            if (socket.connected) {
              socket.once('disconnect', () => resolve());
              socket.disconnect();
              return;
            }
            resolve();
          }),
      ),
    );
    sockets.length = 0;
    await app.close();
    redis.reset();
    eventPublisher.reset();
    mediaEngine.reset();
    process.env.CALL_RECONNECT_GRACE_MS = originalReconnectGraceMs;
    process.env.CALL_NO_ANSWER_TIMEOUT_MS = originalNoAnswerTimeoutMs;
  });

  it('disconnects clients with missing or invalid tokens and joins valid clients to private rooms', async () => {
    const missingTokenClient = createClient();
    const invalidTokenClient = createClient('invalid-token');
    const validClient = createClient('caller-token');

    const missingTokenDisconnect = waitForDisconnect(missingTokenClient);
    const invalidTokenDisconnect = waitForDisconnect(invalidTokenClient);
    const validConnect = waitForConnect(validClient);

    missingTokenClient.connect();
    invalidTokenClient.connect();
    validClient.connect();

    await expect(missingTokenDisconnect).resolves.toBe('io server disconnect');
    await expect(invalidTokenDisconnect).resolves.toBe('io server disconnect');
    await expect(validConnect).resolves.toBeUndefined();

    const socketsInPrivateRoom = await gateway.server
      .in(callerUser.id)
      .fetchSockets();
    expect(socketsInPrivateRoom).toHaveLength(1);
    expect(socketsInPrivateRoom[0]?.id).toBe(validClient.id);
  });

  it('runs the happy-path call lifecycle from initiate to answer', async () => {
    const caller = await connectClient('caller-token');
    const callee = await connectClient('callee-token');

    const callerJoined = onceEvent<{
      callId: string;
      session: { callId: string };
    }>(caller, 'call_joined');
    const incomingCall = onceEvent<{ callId: string }>(callee, 'incoming_call');

    caller.emit('initiate_call', {
      conversationId: 'conv-happy-path',
      targetUserId: calleeUser.id,
      callType: 'VIDEO',
    });

    const [{ callId, session }, incoming] = await Promise.all([
      callerJoined,
      incomingCall,
    ]);

    expect(incoming.callId).toBe(callId);

    const rawSession = await redis.get(`call:${callId}:session`);
    expect(rawSession).not.toBeNull();
    expect(JSON.parse(rawSession as string)).toEqual(
      expect.objectContaining({
        callId,
        conversationId: 'conv-happy-path',
        initiatorId: callerUser.id,
        targetUserId: calleeUser.id,
        status: 'initiated',
      }),
    );

    const callerRejoin = onceEvent(caller, 'call_joined');
    const calleeJoin = onceEvent(callee, 'call_joined');
    const newPeer = onceEvent<{ callId: string; userId: string }>(
      caller,
      'new_peer',
    );

    caller.emit('join_call', { callId: session.callId });
    callee.emit('join_call', { callId: session.callId });

    await Promise.all([callerRejoin, calleeJoin]);
    await expect(newPeer).resolves.toEqual({
      callId,
      userId: calleeUser.id,
    });

    const ringingSession = await redis.get(`call:${callId}:session`);
    expect(JSON.parse(ringingSession as string)).toEqual(
      expect.objectContaining({
        status: 'ringing',
        participantIds: [callerUser.id, calleeUser.id],
      }),
    );

    const answered = onceEvent<{ callId: string; userId: string }>(
      caller,
      'call_answered',
    );
    callee.emit('answer_call', { callId });

    await expect(answered).resolves.toEqual({
      callId,
      userId: calleeUser.id,
    });

    const activeSession = await redis.get(`call:${callId}:session`);
    expect(JSON.parse(activeSession as string)).toEqual(
      expect.objectContaining({
        status: 'active',
      }),
    );
    expect(eventPublisher.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'call.initiated',
        }),
        expect.objectContaining({
          event: 'call.answered',
        }),
      ]),
    );
  });

  it('rejects forged target users before creating a call session', async () => {
    const caller = await connectClient('caller-token');
    const exception = onceEvent<{ status: string; message: string }>(
      caller,
      'exception',
    );

    caller.emit('initiate_call', {
      conversationId: 'conv-happy-path',
      targetUserId: 'forged-user',
      callType: 'VIDEO',
    });

    await expect(exception).resolves.toEqual(
      expect.objectContaining({
        status: 'error',
      }),
    );
    expect(eventPublisher.events).toEqual([]);
  });

  it('runs the media flow from transport creation to consumer resume', async () => {
    const { caller, callee, callId } = await establishActiveCall();

    const callerSendTransport = await createAndConnectTransport(
      caller,
      callId,
      'send',
    );
    const calleeRecvTransport = await createAndConnectTransport(
      callee,
      callId,
      'recv',
    );

    const calleeProducerNotice = onceEvent<{
      callId: string;
      userId: string;
      producerId: string;
      kind: 'audio' | 'video';
    }>(callee, 'new_producer');

    caller.emit('produce', {
      callId,
      transportId: callerSendTransport.transportId,
      kind: 'audio',
      rtpParameters: { codecs: validRtpCapabilities.codecs },
    });

    const producerNotice = await calleeProducerNotice;
    expect(producerNotice.callId).toBe(callId);
    expect(producerNotice.userId).toBe(callerUser.id);
    expect(producerNotice.kind).toBe('audio');

    const consumerCreated = onceEvent<{
      callId: string;
      consumerId: string;
      producerId: string;
    }>(callee, 'consumer_created');

    callee.emit('consume', {
      callId,
      transportId: calleeRecvTransport.transportId,
      producerId: producerNotice.producerId,
      rtpCapabilities: validRtpCapabilities,
    });

    const consumer = await consumerCreated;
    expect(consumer.producerId).toBe(producerNotice.producerId);
    expect(
      mediaEngine.getConsumerState(callId, consumer.consumerId)?.paused,
    ).toBe(true);

    const consumerResumed = onceEvent<{ callId: string; consumerId: string }>(
      callee,
      'consumer_resumed',
    );
    callee.emit('resume_consumer', {
      callId,
      consumerId: consumer.consumerId,
    });

    await expect(consumerResumed).resolves.toEqual({
      callId,
      consumerId: consumer.consumerId,
    });
    expect(
      mediaEngine.getConsumerState(callId, consumer.consumerId)?.paused,
    ).toBe(false);
  });

  it('cancels a call when the caller leaves before answer and clears redis/media state', async () => {
    const caller = await connectClient('caller-token');
    const callee = await connectClient('callee-token');

    const callerJoined = onceEvent<{ callId: string }>(caller, 'call_joined');
    const incomingCall = onceEvent<{ callId: string }>(callee, 'incoming_call');

    caller.emit('initiate_call', {
      conversationId: 'conv-cancel',
      targetUserId: calleeUser.id,
      callType: 'VOICE',
    });

    const [{ callId }, incoming] = await Promise.all([
      callerJoined,
      incomingCall,
    ]);
    expect(incoming.callId).toBe(callId);

    const callEnded = onceEvent<{ callId: string; reason: string }>(
      callee,
      'call_ended',
    );
    caller.emit('leave_call', { callId });

    await expect(callEnded).resolves.toEqual({
      callId,
      reason: 'cancelled',
    });

    await expectCallStateCleared(callId);
    expect(
      eventPublisher.events.find(
        (entry) =>
          entry.event === 'call.ended' &&
          entry.payload.callId === callId &&
          entry.payload.reason === 'cancelled',
      ),
    ).toBeDefined();
  });

  it('auto-ends unanswered voice calls after the backend no-answer timeout', async () => {
    const caller = await connectClient('caller-token');
    const callee = await connectClient('callee-token');

    const callerJoined = onceEvent<{ callId: string }>(caller, 'call_joined');
    const incomingCall = onceEvent<{ callId: string }>(callee, 'incoming_call');

    caller.emit('initiate_call', {
      conversationId: 'conv-cancel',
      targetUserId: calleeUser.id,
      callType: 'VOICE',
    });

    const [{ callId }, incoming] = await Promise.all([
      callerJoined,
      incomingCall,
    ]);
    expect(incoming.callId).toBe(callId);

    const callerEnded = onceEvent<{ callId: string; reason: string }>(
      caller,
      'call_ended',
    );
    const calleeEnded = onceEvent<{ callId: string; reason: string }>(
      callee,
      'call_ended',
    );

    await expect(callerEnded).resolves.toEqual({
      callId,
      reason: 'no_answer',
    });
    await expect(calleeEnded).resolves.toEqual({
      callId,
      reason: 'no_answer',
    });

    await expectCallStateCleared(callId);
    expect(
      eventPublisher.events.find(
        (entry) =>
          entry.event === 'call.ended' &&
          entry.payload.callId === callId &&
          entry.payload.reason === 'no_answer',
      ),
    ).toBeDefined();
  });

  it('fails fast when a ringing call disconnects before answer', async () => {
    const { caller, callee, callId } = await establishRingingCall();

    const callEnded = onceEvent<{ callId: string; reason: string }>(
      callee,
      'call_ended',
    );

    const callerDisconnected = waitForDisconnect(caller);
    caller.disconnect();
    await callerDisconnected;

    await expect(callEnded).resolves.toEqual({
      callId,
      reason: 'disconnected',
    });
    await expectCallStateCleared(callId);
  });

  it('rejects rejoin attempts for calls that are not active', async () => {
    const { caller, callId } = await establishRingingCall();

    const exception = onceEvent<{ status: string; message: string }>(
      caller,
      'exception',
    );
    caller.emit('rejoin_call', { callId });

    await expect(exception).resolves.toEqual(
      expect.objectContaining({
        status: 'error',
      }),
    );
  });

  it('ends an active call after the reconnect grace window expires', async () => {
    const { caller, callee, callId } = await establishActiveCall();

    const callEnded = onceEvent<{ callId: string; reason: string }>(
      callee,
      'call_ended',
    );

    const callerDisconnected = waitForDisconnect(caller);
    caller.disconnect();
    await callerDisconnected;

    expect(await redis.get(`call:${callId}:session`)).not.toBeNull();
    const disconnectedParticipant = await waitForStoredParticipant(
      callId,
      callerUser.id,
      (participant) =>
        participant?.isConnected === false &&
        typeof participant.reconnectDeadlineAt === 'string',
    );
    expect(disconnectedParticipant?.isConnected).toBe(false);
    expect(disconnectedParticipant?.reconnectDeadlineAt).toBeDefined();

    await expect(callEnded).resolves.toEqual({
      callId,
      reason: 'disconnected',
    });

    await expectCallStateCleared(callId);
    expect(
      eventPublisher.events.find(
        (entry) =>
          entry.event === 'call.ended' &&
          entry.payload.callId === callId &&
          entry.payload.reason === 'disconnected',
      ),
    ).toBeDefined();
  });

  it('rejoins an active call within the reconnect grace window', async () => {
    const { caller, callee, callId } = await establishActiveCall();
    const calleeSendTransport = await createAndConnectTransport(
      callee,
      callId,
      'send',
    );

    const initialProducerNotice = onceEvent<{
      callId: string;
      userId: string;
      producerId: string;
      kind: 'audio' | 'video';
    }>(caller, 'new_producer');
    callee.emit('produce', {
      callId,
      transportId: calleeSendTransport.transportId,
      kind: 'audio',
      rtpParameters: { codecs: validRtpCapabilities.codecs },
    });
    const producedByCallee = await initialProducerNotice;

    const peerReconnecting = onceEvent<{
      callId: string;
      userId: string;
      reconnectDeadlineAt: string;
    }>(callee, 'peer_reconnecting');
    const unexpectedCallEnded = waitForOptionalEvent(callee, 'call_ended', 120);
    const callerDisconnected = waitForDisconnect(caller);
    caller.disconnect();
    await callerDisconnected;

    await expect(peerReconnecting).resolves.toEqual({
      callId,
      userId: callerUser.id,
      reconnectDeadlineAt: expect.any(String),
    });

    await waitForStoredParticipant(
      callId,
      callerUser.id,
      (participant) =>
        participant?.isConnected === false &&
        typeof participant.reconnectDeadlineAt === 'string',
    );

    const callerReconnected = await connectClient('caller-token');
    const callRejoined = onceEvent<{
      callId: string;
      session: { status: string };
    }>(callerReconnected, 'call_rejoined');
    const replayedProducer = onceEvent<{
      callId: string;
      userId: string;
      producerId: string;
      kind: 'audio' | 'video';
    }>(callerReconnected, 'new_producer');
    const peerReconnected = onceEvent<{ callId: string; userId: string }>(
      callee,
      'peer_reconnected',
    );
    callerReconnected.emit('rejoin_call', { callId });

    await expect(callRejoined).resolves.toEqual(
      expect.objectContaining({
        callId,
        session: expect.objectContaining({
          status: 'active',
        }),
      }),
    );
    await expect(replayedProducer).resolves.toEqual({
      callId,
      userId: calleeUser.id,
      producerId: producedByCallee.producerId,
      kind: 'audio',
    });
    await expect(peerReconnected).resolves.toEqual({
      callId,
      userId: callerUser.id,
    });
    await expect(unexpectedCallEnded).resolves.toBeNull();

    const participantAfterRejoin = await waitForStoredParticipant(
      callId,
      callerUser.id,
      (participant) =>
        participant?.isConnected === true &&
        participant.socketIds?.length === 1 &&
        participant.reconnectDeadlineAt === undefined,
    );
    expect(participantAfterRejoin?.isConnected).toBe(true);
    expect(participantAfterRejoin?.socketIds).toHaveLength(1);
    expect(participantAfterRejoin?.reconnectDeadlineAt).toBeUndefined();
    expect(await redis.get(`call:${callId}:session`)).not.toBeNull();
  });

  it('rejects rejoin attempts after the reconnect grace window has already expired', async () => {
    const { caller, callee, callId } = await establishActiveCall();

    const callEnded = onceEvent<{ callId: string; reason: string }>(
      callee,
      'call_ended',
    );
    const callerDisconnected = waitForDisconnect(caller);
    caller.disconnect();
    await callerDisconnected;
    await callEnded;

    const callerReconnected = await connectClient('caller-token');
    const exception = onceEvent<{ status: string; message: string }>(
      callerReconnected,
      'exception',
    );
    callerReconnected.emit('rejoin_call', { callId });

    await expect(exception).resolves.toEqual(
      expect.objectContaining({
        status: 'error',
      }),
    );
  });

  it('rejects rejoin attempts from users outside the active call', async () => {
    const { callId } = await establishActiveCall();
    const outsider = await connectClient('outsider-token');

    const exception = onceEvent<{ status: string; message: string }>(
      outsider,
      'exception',
    );
    outsider.emit('rejoin_call', { callId });

    await expect(exception).resolves.toEqual(
      expect.objectContaining({
        status: 'error',
      }),
    );
  });

  it('keeps the call active when one socket disconnects but the same user still has another socket in the call', async () => {
    const { caller, callee, callId } = await establishActiveCall();
    const callerSecondSocket = await connectClient('caller-token');

    const secondSocketJoined = onceEvent(callerSecondSocket, 'call_joined');
    callerSecondSocket.emit('join_call', { callId });
    await secondSocketJoined;

    const participantBeforeDisconnect = await getStoredParticipant(
      callId,
      callerUser.id,
    );
    expect(participantBeforeDisconnect?.socketIds).toHaveLength(2);

    const unexpectedCallEnded = waitForOptionalEvent(callee, 'call_ended', 300);
    const callerDisconnected = waitForDisconnect(caller);
    caller.disconnect();
    await callerDisconnected;

    await expect(unexpectedCallEnded).resolves.toBeNull();
    expect(await redis.get(`call:${callId}:session`)).not.toBeNull();

    const participantAfterDisconnect = await waitForStoredParticipant(
      callId,
      callerUser.id,
      (participant) =>
        participant?.socketIds?.length === 1 && participant.isConnected === true,
    );
    expect(participantAfterDisconnect?.socketIds).toHaveLength(1);
    expect(participantAfterDisconnect?.isConnected).toBe(true);
  });

  async function establishActiveCall() {
    const caller = await connectClient('caller-token');
    const callee = await connectClient('callee-token');

    const callerJoined = onceEvent<{ callId: string }>(caller, 'call_joined');
    const incomingCall = onceEvent<{ callId: string }>(callee, 'incoming_call');

    caller.emit('initiate_call', {
      conversationId: 'conv-active',
      targetUserId: calleeUser.id,
      callType: 'VIDEO',
    });

    const [{ callId }] = await Promise.all([callerJoined, incomingCall]);

    const callerRejoin = onceEvent(caller, 'call_joined');
    const calleeJoin = onceEvent(callee, 'call_joined');
    caller.emit('join_call', { callId });
    callee.emit('join_call', { callId });
    await Promise.all([callerRejoin, calleeJoin]);

    const callAnswered = onceEvent<{ callId: string; userId: string }>(
      caller,
      'call_answered',
    );
    callee.emit('answer_call', { callId });
    await callAnswered;

    return { caller, callee, callId };
  }

  async function establishRingingCall() {
    const caller = await connectClient('caller-token');
    const callee = await connectClient('callee-token');

    const callerJoined = onceEvent<{ callId: string }>(caller, 'call_joined');
    const incomingCall = onceEvent<{ callId: string }>(callee, 'incoming_call');

    caller.emit('initiate_call', {
      conversationId: 'conv-active',
      targetUserId: calleeUser.id,
      callType: 'VIDEO',
    });

    const [{ callId }] = await Promise.all([callerJoined, incomingCall]);

    const callerRejoin = onceEvent(caller, 'call_joined');
    const calleeJoin = onceEvent(callee, 'call_joined');
    caller.emit('join_call', { callId });
    callee.emit('join_call', { callId });
    await Promise.all([callerRejoin, calleeJoin]);

    return { caller, callee, callId };
  }

  async function createAndConnectTransport(
    client: Socket,
    callId: string,
    direction: 'send' | 'recv',
  ) {
    const transportCreated = onceEvent<{
      callId: string;
      transportId: string;
      dtlsParameters: Record<string, unknown>;
    }>(client, 'transport_created');

    client.emit('create_transport', { callId, direction });
    const transport = await transportCreated;

    const transportConnected = onceEvent<{
      callId: string;
      transportId: string;
    }>(client, 'transport_connected');
    client.emit('connect_transport', {
      callId,
      transportId: transport.transportId,
      dtlsParameters: transport.dtlsParameters,
    });

    await expect(transportConnected).resolves.toEqual({
      callId,
      transportId: transport.transportId,
    });

    return transport;
  }

  async function expectCallStateCleared(callId: string) {
    expect(await redis.get(`call:${callId}:session`)).toBeNull();
    expect(await redis.hgetall(`call:${callId}:participants`)).toEqual({});
    expect(await redis.smembers(`call:${callId}:transport-index`)).toEqual([]);
    expect(await redis.smembers(`call:${callId}:producer-index`)).toEqual([]);
    expect(mediaEngine.getRoomState(callId)).toBeUndefined();
  }

  async function getStoredParticipant(callId: string, userId: string) {
    const raw = await redis.hget(`call:${callId}:participants`, userId);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as {
      userId: string;
      socketIds?: string[];
      isConnected?: boolean;
      reconnectDeadlineAt?: string;
    };
  }

  async function waitForStoredParticipant(
    callId: string,
    userId: string,
    predicate: (participant: Awaited<ReturnType<typeof getStoredParticipant>>) => boolean,
    timeoutMs = 500,
  ) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      const participant = await getStoredParticipant(callId, userId);
      if (predicate(participant)) {
        return participant;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return getStoredParticipant(callId, userId);
  }

  function createClient(token?: string): Socket {
    const socket = io(`${baseUrl}/call`, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
      ...(token ? { auth: { token } } : {}),
    });
    sockets.push(socket);
    return socket;
  }

  async function connectClient(token: string): Promise<Socket> {
    const socket = createClient(token);
    const connected = waitForConnect(socket);
    socket.connect();
    await connected;
    return socket;
  }

  function waitForConnect(socket: Socket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for socket connect'));
      }, 3000);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        socket.off('connect_error', onConnectError);
      };

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onConnectError = (error: Error) => {
        cleanup();
        reject(error);
      };

      socket.once('connect', onConnect);
      socket.once('connect_error', onConnectError);
    });
  }

  function waitForDisconnect(socket: Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for socket disconnect'));
      }, 3000);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off('disconnect', onDisconnect);
        socket.off('connect_error', onConnectError);
      };

      const onDisconnect = (reason: string) => {
        cleanup();
        resolve(reason);
      };

      const onConnectError = (error: Error) => {
        cleanup();
        resolve(`connect_error:${error.message}`);
      };

      socket.once('disconnect', onDisconnect);
      socket.once('connect_error', onConnectError);
    });
  }

  function onceEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ${event}`));
      }, 3000);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off(event, onEvent);
      };

      const onEvent = (payload: T) => {
        cleanup();
        resolve(payload);
      };

      socket.once(event, onEvent);
    });
  }

  function waitForOptionalEvent<T>(
    socket: Socket,
    event: string,
    timeoutMs: number,
  ): Promise<T | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off(event, onEvent);
      };

      const onEvent = (payload: T) => {
        cleanup();
        resolve(payload);
      };

      socket.once(event, onEvent);
    });
  }
});
