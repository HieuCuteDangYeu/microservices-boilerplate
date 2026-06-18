import type { Socket } from 'socket.io';
import { CallGateway } from './call.gateway';
import { CallParticipant } from '../../domain/entities/call-participant.entity';
import { CallSession } from '../../domain/entities/call-session.entity';

describe('CallGateway reconnect recovery', () => {
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
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.CALL_RECONNECT_GRACE_MS;
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
    const roomEmitter = { emit: jest.fn() };
    gateway.server = {
      to: jest.fn().mockReturnValue(roomEmitter),
    } as never;

    await gateway.handleDisconnect(
      createSocket({
        id: 'socket-1',
        userId: 'user-a',
        callIds: ['call-1'],
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
    expect(roomEmitter.emit).toHaveBeenNthCalledWith(1, 'peer_left', {
      callId: 'call-1',
      userId: 'user-a',
      reason: 'disconnected',
    });
    expect(roomEmitter.emit).toHaveBeenNthCalledWith(2, 'call_ended', {
      callId: 'call-1',
      reason: 'disconnected',
    });
  });

  it('clears the pending disconnect timeout after a successful rejoin', async () => {
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
    const gateway = createGateway({
      joinCallUseCase,
      leaveCallUseCase,
      sessionRepository,
      stateRepository,
    });
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as never;

    await gateway.handleDisconnect(
      createSocket({
        id: 'socket-1',
        userId: 'user-a',
        callIds: ['call-1'],
      }),
    );

    const rejoiningSocket = createSocket({
      id: 'socket-2',
      userId: 'user-a',
      emit: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
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
    expect(leaveCallUseCase.execute).not.toHaveBeenCalled();
    expect(stateRepository.removeParticipant).not.toHaveBeenCalled();
  });
});

function createGateway(overrides?: {
  joinCallUseCase?: { execute: jest.Mock };
  leaveCallUseCase?: { execute: jest.Mock };
  sessionRepository?: { findByCallId: jest.Mock };
  stateRepository?: {
    getParticipant: jest.Mock;
    upsertParticipant: jest.Mock;
    removeParticipant: jest.Mock;
  };
}) {
  return new CallGateway(
    {} as never,
    (overrides?.joinCallUseCase ?? { execute: jest.fn() }) as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    (overrides?.leaveCallUseCase ?? { execute: jest.fn() }) as never,
    {} as never,
    {} as never,
    {} as never,
    (overrides?.sessionRepository ?? {
      findByCallId: jest.fn(),
    }) as never,
    (overrides?.stateRepository ?? {
      getParticipant: jest.fn(),
      upsertParticipant: jest.fn(),
      removeParticipant: jest.fn(),
    }) as never,
    { send: jest.fn() } as never,
  );
}

function createSocket(input: {
  id: string;
  userId: string;
  callIds: string[];
  emit?: jest.Mock;
  join?: jest.Mock;
}) {
  return {
    id: input.id,
    data: {
      userId: input.userId,
      callIds: input.callIds,
    },
    emit: input.emit ?? jest.fn(),
    join: input.join ?? jest.fn().mockResolvedValue(undefined),
  } as unknown as Socket;
}
