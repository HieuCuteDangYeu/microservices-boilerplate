import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import type { Socket } from 'socket.io';
import { CallParticipant } from '../../../src/domain/entities/call-participant.entity';
import { CallSession } from '../../../src/domain/entities/call-session.entity';
import { CallGateway } from '../../../src/infrastructure/gateways/call.gateway';

describe('CallGateway reconnect recovery', () => {
  const initiatedVoiceSession = new CallSession({
    callId: 'call-0',
    conversationId: 'conv-0',
    initiatorId: 'user-a',
    targetUserId: 'user-b',
    callType: 'VOICE',
    status: 'initiated',
    participantIds: ['user-a'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const activeSession = new CallSession({
    callId: 'call-1',
    conversationId: 'conv-1',
    initiatorId: 'user-a',
    targetUserId: 'user-b',
    callType: 'VOICE',
    status: 'active',
    participantIds: ['user-a', 'user-b'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    process.env.CALL_RECONNECT_GRACE_MS = '15000';
    process.env.CALL_NO_ANSWER_TIMEOUT_MS = '30000';
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.CALL_RECONNECT_GRACE_MS;
    delete process.env.CALL_NO_ANSWER_TIMEOUT_MS;
  });

  it('uses strict heartbeat settings for the call namespace', () => {
    expect(Reflect.getMetadata(GATEWAY_OPTIONS, CallGateway)).toMatchObject({
      namespace: '/call',
      pingInterval: 5000,
      pingTimeout: 5000,
    });
  });

  it('ends unanswered voice calls after the no-answer timeout', async () => {
    const initiateCallUseCase = {
      execute: jest.fn().mockResolvedValue({
        role: 'host',
        session: initiatedVoiceSession,
        rtpCapabilities: { codecs: [], headerExtensions: [] },
      }),
    };
    const leaveCallUseCase = {
      execute: jest.fn().mockResolvedValue({
        session: initiatedVoiceSession,
        endedReason: 'no_answer',
        shouldEmitPeerLeft: false,
      }),
    };
    const sessionRepository = {
      findByCallId: jest.fn().mockResolvedValue(initiatedVoiceSession),
    };
    const callEmitter = { emit: jest.fn() };
    const userEmitter = { emit: jest.fn() };
    const gateway = createGateway({
      initiateCallUseCase,
      leaveCallUseCase,
      sessionRepository,
    });
    gateway.server = {
      to: jest.fn().mockImplementation((roomId: string) => {
        return roomId === initiatedVoiceSession.targetUserId
          ? userEmitter
          : callEmitter;
      }),
    } as never;

    const callerSocket = createSocket({
      id: 'socket-0',
      userId: initiatedVoiceSession.initiatorId,
      callIds: [],
      emit: jest.fn(),
    });

    await gateway.handleInitiateCall(
      {
        conversationId: initiatedVoiceSession.conversationId,
        targetUserId: initiatedVoiceSession.targetUserId,
        callType: 'VOICE',
      },
      callerSocket,
    );

    expect(callerSocket.emit).toHaveBeenCalledWith(
      'call_joined',
      expect.objectContaining({
        callId: initiatedVoiceSession.callId,
        noAnswerTimeoutMs: 30000,
      }),
    );

    expect(userEmitter.emit).toHaveBeenCalledWith(
      'incoming_call',
      expect.objectContaining({
        callId: initiatedVoiceSession.callId,
        conversationId: initiatedVoiceSession.conversationId,
        initiatorId: initiatedVoiceSession.initiatorId,
        targetUserId: initiatedVoiceSession.targetUserId,
        callType: 'VOICE',
      }),
    );

    await jest.advanceTimersByTimeAsync(30000);

    expect(leaveCallUseCase.execute).toHaveBeenCalledWith(
      initiatedVoiceSession.callId,
      initiatedVoiceSession.initiatorId,
      'no_answer',
    );
    expect(callEmitter.emit).toHaveBeenCalledWith('call_ended', {
      callId: initiatedVoiceSession.callId,
      reason: 'no_answer',
    });
  });

  it('clears the unanswered timeout when the callee answers', async () => {
    const initiateCallUseCase = {
      execute: jest.fn().mockResolvedValue({
        role: 'host',
        session: initiatedVoiceSession,
        rtpCapabilities: { codecs: [], headerExtensions: [] },
      }),
    };
    const answerCallUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const leaveCallUseCase = {
      execute: jest.fn(),
    };
    const gateway = createGateway({
      initiateCallUseCase,
      answerCallUseCase,
      leaveCallUseCase,
    });
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as never;

    await gateway.handleInitiateCall(
      {
        conversationId: initiatedVoiceSession.conversationId,
        targetUserId: initiatedVoiceSession.targetUserId,
        callType: 'VOICE',
      },
      createSocket({
        id: 'socket-0',
        userId: initiatedVoiceSession.initiatorId,
        callIds: [],
      }),
    );

    await gateway.handleAnswerCall(
      { callId: initiatedVoiceSession.callId },
      createSocket({
        id: 'socket-1',
        userId: initiatedVoiceSession.targetUserId,
        callIds: [initiatedVoiceSession.callId],
      }),
    );
    await jest.advanceTimersByTimeAsync(30000);

    expect(answerCallUseCase.execute).toHaveBeenCalledWith(
      initiatedVoiceSession.callId,
      initiatedVoiceSession.targetUserId,
    );
    expect(leaveCallUseCase.execute).not.toHaveBeenCalled();
  });

  it('defers active-call teardown until the reconnect grace window expires', async () => {
    const leaveCallUseCase = {
      execute: jest.fn().mockResolvedValue({
        session: activeSession,
        endedReason: 'disconnected',
        shouldEmitPeerLeft: true,
      }),
    };
    const stateRepository = {
      getParticipant: jest
        .fn()
        .mockResolvedValueOnce(
          new CallParticipant({
            userId: 'user-a',
            callId: 'call-1',
            role: 'host',
            socketId: 'socket-1',
            socketIds: ['socket-1'],
            isConnected: true,
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        )
        .mockResolvedValueOnce(
          new CallParticipant({
            userId: 'user-a',
            callId: 'call-1',
            role: 'host',
            socketIds: [],
            isConnected: false,
            reconnectDeadlineAt: new Date('2026-01-01T00:00:15.000Z'),
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        ),
      upsertParticipant: jest.fn(),
      removeParticipant: jest.fn(),
    };
    const gateway = createGateway({
      leaveCallUseCase,
      sessionRepository: {
        findByCallId: jest.fn().mockResolvedValue(activeSession),
      },
      stateRepository,
    });
    const peerEmitter = { emit: jest.fn() };
    const roomEmitter = { emit: jest.fn() };
    gateway.server = {
      to: jest.fn().mockReturnValue(roomEmitter),
    } as never;

    await gateway.handleDisconnect(
      createSocket({
        id: 'socket-1',
        userId: 'user-a',
        callIds: ['call-1'],
        to: jest.fn().mockReturnValue(peerEmitter),
      }),
    );

    expect(stateRepository.upsertParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-a',
        callId: 'call-1',
        socketIds: [],
        isConnected: false,
      }),
    );
    expect(roomEmitter.emit).toHaveBeenNthCalledWith(1, 'peer_reconnecting', {
      callId: 'call-1',
      userId: 'user-a',
      reconnectDeadlineAt: '2026-01-01T00:00:15.000Z',
    });
    expect(leaveCallUseCase.execute).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(15000);

    expect(stateRepository.removeParticipant).toHaveBeenCalledWith(
      'call-1',
      'user-a',
    );
    expect(leaveCallUseCase.execute).toHaveBeenCalledWith(
      'call-1',
      'user-a',
      'disconnected',
    );
    expect(roomEmitter.emit).toHaveBeenNthCalledWith(2, 'peer_left', {
      callId: 'call-1',
      userId: 'user-a',
      reason: 'disconnected',
    });
    expect(roomEmitter.emit).toHaveBeenNthCalledWith(3, 'call_ended', {
      callId: 'call-1',
      reason: 'disconnected',
    });
  });

  it('clears the pending disconnect timeout, notifies the peer, and replays active producers after a successful rejoin', async () => {
    const joinCallUseCase = {
      execute: jest.fn().mockResolvedValue({
        role: 'host',
        session: activeSession,
        rtpCapabilities: { codecs: [], headerExtensions: [] },
      }),
    };
    const leaveCallUseCase = {
      execute: jest.fn(),
    };
    const stateRepository = {
      getParticipant: jest
        .fn()
        .mockResolvedValueOnce(
          new CallParticipant({
            userId: 'user-a',
            callId: 'call-1',
            role: 'host',
            socketId: 'socket-1',
            socketIds: ['socket-1'],
            isConnected: true,
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        )
        .mockResolvedValueOnce(
          new CallParticipant({
            userId: 'user-a',
            callId: 'call-1',
            role: 'host',
            socketIds: [],
            isConnected: false,
            reconnectDeadlineAt: new Date('2026-01-01T00:00:15.000Z'),
            joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          }),
        ),
      upsertParticipant: jest.fn(),
      removeParticipant: jest.fn(),
    };
    const sessionRepository = {
      findByCallId: jest.fn().mockResolvedValue(activeSession),
    };
    const mediaEngine = {
      listActiveProducers: jest.fn().mockResolvedValue([
        {
          producerId: 'producer-1',
          userId: 'user-b',
          kind: 'audio',
        },
      ]),
    };
    const peerEmitter = { emit: jest.fn() };
    const gateway = createGateway({
      joinCallUseCase,
      leaveCallUseCase,
      mediaEngine,
      sessionRepository,
      stateRepository,
    });
    gateway.server = {
      to: jest.fn().mockReturnValue(peerEmitter),
    } as never;

    await gateway.handleDisconnect(
      createSocket({
        id: 'socket-1',
        userId: 'user-a',
        callIds: ['call-1'],
        to: jest.fn().mockReturnValue(peerEmitter),
      }),
    );

    const rejoiningSocket = createSocket({
      id: 'socket-2',
      userId: 'user-a',
      emit: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      to: jest.fn().mockReturnValue(peerEmitter),
    });

    await gateway.handleRejoinCall({ callId: 'call-1' }, rejoiningSocket);
    await jest.advanceTimersByTimeAsync(15000);

    expect(joinCallUseCase.execute).toHaveBeenCalledWith(
      'call-1',
      'user-a',
      'socket-2',
    );
    expect(rejoiningSocket.emit).toHaveBeenCalledWith(
      'call_rejoined',
      expect.objectContaining({
        callId: 'call-1',
        session: expect.objectContaining({
          status: 'active',
        }),
      }),
    );
    expect(peerEmitter.emit).toHaveBeenCalledWith('peer_reconnected', {
      callId: 'call-1',
      userId: 'user-a',
    });
    expect(mediaEngine.listActiveProducers).toHaveBeenCalledWith(
      'call-1',
      'user-a',
    );
    expect(rejoiningSocket.emit).toHaveBeenCalledWith('new_producer', {
      callId: 'call-1',
      userId: 'user-b',
      producerId: 'producer-1',
      kind: 'audio',
    });
    expect(leaveCallUseCase.execute).not.toHaveBeenCalled();
    expect(stateRepository.removeParticipant).not.toHaveBeenCalled();
  });

  it('rejects rejoin when the reconnect deadline has already expired', async () => {
    const joinCallUseCase = {
      execute: jest.fn(),
    };
    const stateRepository = {
      getParticipant: jest.fn().mockResolvedValue(
        new CallParticipant({
          userId: 'user-a',
          callId: 'call-1',
          role: 'host',
          socketIds: [],
          isConnected: false,
          reconnectDeadlineAt: new Date('2025-12-31T23:59:59.000Z'),
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ),
      upsertParticipant: jest.fn(),
      removeParticipant: jest.fn(),
    };
    const gateway = createGateway({
      joinCallUseCase,
      sessionRepository: {
        findByCallId: jest.fn().mockResolvedValue(activeSession),
      },
      stateRepository,
    });

    await expect(
      gateway.handleRejoinCall(
        { callId: 'call-1' },
        createSocket({
          id: 'socket-2',
          userId: 'user-a',
          emit: jest.fn(),
          join: jest.fn().mockResolvedValue(undefined),
        }),
      ),
    ).rejects.toThrow('Reconnect window expired');
    expect(joinCallUseCase.execute).not.toHaveBeenCalled();
  });
});

function createGateway(overrides?: {
  initiateCallUseCase?: { execute: jest.Mock };
  joinCallUseCase?: { execute: jest.Mock };
  leaveCallUseCase?: { execute: jest.Mock };
  rejectCallUseCase?: { execute: jest.Mock };
  answerCallUseCase?: { execute: jest.Mock };
  mediaEngine?: { listActiveProducers: jest.Mock };
  sessionRepository?: { findByCallId: jest.Mock };
  stateRepository?: {
    getParticipant: jest.Mock;
    upsertParticipant: jest.Mock;
    removeParticipant: jest.Mock;
  };
}) {
  return new CallGateway(
    (overrides?.initiateCallUseCase ?? { execute: jest.fn() }) as never,
    (overrides?.joinCallUseCase ?? { execute: jest.fn() }) as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    (overrides?.leaveCallUseCase ?? { execute: jest.fn() }) as never,
    (overrides?.rejectCallUseCase ?? { execute: jest.fn() }) as never,
    (overrides?.answerCallUseCase ?? { execute: jest.fn() }) as never,
    {} as never,
    {} as never,
    (overrides?.mediaEngine ?? {
      listActiveProducers: jest.fn().mockResolvedValue([]),
    }) as never,
    (overrides?.sessionRepository ?? {
      findByCallId: jest.fn(),
    }) as never,
    (overrides?.stateRepository ?? {
      getParticipant: jest.fn(),
      upsertParticipant: jest.fn(),
      removeParticipant: jest.fn(),
    }) as never,
    { send: jest.fn() } as never,
    { issue: jest.fn().mockReturnValue('telemetry-token') } as never,
  );
}

function createSocket(input: {
  id: string;
  userId: string;
  callIds: string[];
  emit?: jest.Mock;
  join?: jest.Mock;
  to?: jest.Mock;
}) {
  return {
    id: input.id,
    data: {
      userId: input.userId,
      callIds: input.callIds,
    },
    emit: input.emit ?? jest.fn(),
    join: input.join ?? jest.fn().mockResolvedValue(undefined),
    to: input.to ?? jest.fn().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Socket;
}
