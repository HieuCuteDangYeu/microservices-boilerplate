import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AnswerCallUseCase } from './answer-call.use-case';
import { CreateTransportUseCase } from './create-transport.use-case';
import { InitiateCallUseCase } from './initiate-call.use-case';
import { JoinCallUseCase } from './join-call.use-case';
import { LeaveCallUseCase } from './leave-call.use-case';
import { CallSession } from '../../domain/entities/call-session.entity';

describe('Call lifecycle use cases', () => {
  const baseSession = new CallSession({
    callId: 'call-1',
    conversationId: 'conv-1',
    initiatorId: 'user-a',
    targetUserId: 'user-b',
    callType: 'VIDEO',
    status: 'initiated',
    participantIds: ['user-a'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  it('creates a new initiated session and publishes call.initiated', async () => {
    const sessionRepository = {
      save: jest.fn((session: CallSession) => Promise.resolve(session)),
    };
    const stateRepository = {
      upsertParticipant: jest.fn(),
    };
    const eventPublisher = {
      publish: jest.fn(),
    };
    const mediaEngine = {
      createRoom: jest.fn(),
      getRouterRtpCapabilities: jest.fn().mockResolvedValue({
        codecs: [],
        headerExtensions: [],
      }),
    };
    const conversationClient = {
      send: jest.fn().mockReturnValue(
        of({
          id: 'conv-1',
          participantIds: ['user-a', 'user-b'],
          isGroup: false,
        }),
      ),
    };

    const useCase = new InitiateCallUseCase(
      sessionRepository as never,
      stateRepository as never,
      eventPublisher,
      mediaEngine as never,
      conversationClient as never,
    );

    const result = await useCase.execute(
      'conv-1',
      'user-a',
      'user-b',
      'VIDEO',
      'socket-1',
    );

    expect(mediaEngine.createRoom).toHaveBeenCalledWith(result.session.callId);
    expect(sessionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        initiatorId: 'user-a',
        targetUserId: 'user-b',
        status: 'initiated',
      }),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'call.initiated',
      expect.objectContaining({
        callId: result.session.callId,
        conversationId: 'conv-1',
        initiatorId: 'user-a',
        targetUserId: 'user-b',
        userId: 'user-a',
        callType: 'VIDEO',
      }),
    );
    expect(result.role).toBe('host');
  });

  it('rejects forged target users before any call state is created', async () => {
    const sessionRepository = {
      save: jest.fn(),
    };
    const stateRepository = {
      upsertParticipant: jest.fn(),
    };
    const eventPublisher = {
      publish: jest.fn(),
    };
    const mediaEngine = {
      createRoom: jest.fn(),
      getRouterRtpCapabilities: jest.fn(),
    };
    const conversationClient = {
      send: jest.fn().mockReturnValue(
        of({
          id: 'conv-1',
          participantIds: ['user-a', 'user-b'],
          isGroup: false,
        }),
      ),
    };

    const useCase = new InitiateCallUseCase(
      sessionRepository as never,
      stateRepository as never,
      eventPublisher,
      mediaEngine as never,
      conversationClient as never,
    );

    await expect(
      useCase.execute('conv-1', 'user-a', 'user-c', 'VIDEO', 'socket-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mediaEngine.createRoom).not.toHaveBeenCalled();
    expect(sessionRepository.save).not.toHaveBeenCalled();
    expect(stateRepository.upsertParticipant).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('maps conversation membership failures before creating any call state', async () => {
    const sessionRepository = {
      save: jest.fn(),
    };
    const stateRepository = {
      upsertParticipant: jest.fn(),
    };
    const eventPublisher = {
      publish: jest.fn(),
    };
    const mediaEngine = {
      createRoom: jest.fn(),
      getRouterRtpCapabilities: jest.fn(),
    };
    const conversationClient = {
      send: jest
        .fn()
        .mockReturnValue(
          throwError(
            () => new Error('You are not a participant of this conversation'),
          ),
        ),
    };

    const useCase = new InitiateCallUseCase(
      sessionRepository as never,
      stateRepository as never,
      eventPublisher,
      mediaEngine as never,
      conversationClient as never,
    );

    await expect(
      useCase.execute('conv-1', 'user-a', 'user-b', 'VIDEO', 'socket-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(mediaEngine.createRoom).not.toHaveBeenCalled();
    expect(sessionRepository.save).not.toHaveBeenCalled();
    expect(stateRepository.upsertParticipant).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('marks the call as ringing when the callee joins for the first time', async () => {
    const sessionRepository = {
      findByCallId: jest.fn().mockResolvedValue(new CallSession(baseSession)),
      save: jest.fn((session: CallSession) => Promise.resolve(session)),
    };
    const stateRepository = {
      upsertParticipant: jest.fn(),
    };
    const mediaEngine = {
      getRouterRtpCapabilities: jest.fn().mockResolvedValue({
        codecs: [],
        headerExtensions: [],
      }),
    };

    const useCase = new JoinCallUseCase(
      sessionRepository as never,
      stateRepository as never,
      mediaEngine as never,
    );

    const result = await useCase.execute('call-1', 'user-b', 'socket-2');

    expect(result.role).toBe('guest');
    expect(result.shouldEmitNewPeer).toBe(true);
    expect(result.session.status).toBe('ringing');
    expect(result.session.participantIds).toEqual(['user-a', 'user-b']);
    expect(sessionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ringing',
        participantIds: ['user-a', 'user-b'],
      }),
    );
  });

  it('rejects transport creation for users outside the call', async () => {
    const sessionRepository = {
      findByCallId: jest.fn().mockResolvedValue(new CallSession(baseSession)),
    };
    const mediaEngine = {
      createSendTransport: jest.fn(),
      createRecvTransport: jest.fn(),
    };

    const useCase = new CreateTransportUseCase(
      mediaEngine as never,
      sessionRepository as never,
    );

    await expect(
      useCase.execute('call-1', 'user-c', 'send'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows only the callee to answer and activates the call', async () => {
    const sessionRepository = {
      findByCallId: jest.fn().mockResolvedValue(
        new CallSession({
          ...baseSession,
          status: 'ringing',
          participantIds: ['user-a', 'user-b'],
        }),
      ),
      save: jest.fn((session: CallSession) => Promise.resolve(session)),
    };
    const eventPublisher = {
      publish: jest.fn(),
    };

    const useCase = new AnswerCallUseCase(
      sessionRepository as never,
      eventPublisher,
    );

    await useCase.execute('call-1', 'user-b');

    const savedSession = sessionRepository.save.mock.calls[0]?.[0] as
      | CallSession
      | undefined;
    expect(savedSession).toEqual(
      expect.objectContaining({
        status: 'active',
      }),
    );
    expect(savedSession?.answeredAt).toBeInstanceOf(Date);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'call.answered',
      expect.objectContaining({
        callId: 'call-1',
        userId: 'user-b',
      }),
    );
  });

  it('cancels a pre-answer call and clears room state', async () => {
    const sessionRepository = {
      findByCallId: jest.fn().mockResolvedValue(new CallSession(baseSession)),
      delete: jest.fn(),
    };
    const stateRepository = {
      clearCallState: jest.fn(),
    };
    const eventPublisher = {
      publish: jest.fn(),
    };
    const mediaEngine = {
      closeRoom: jest.fn(),
    };

    const useCase = new LeaveCallUseCase(
      sessionRepository as never,
      stateRepository as never,
      eventPublisher,
      mediaEngine as never,
    );

    const result = await useCase.execute('call-1', 'user-a');

    expect(result.endedReason).toBe('cancelled');
    expect(result.session.status).toBe('cancelled');
    expect(mediaEngine.closeRoom).toHaveBeenCalledWith('call-1');
    expect(stateRepository.clearCallState).toHaveBeenCalledWith('call-1');
    expect(sessionRepository.delete).toHaveBeenCalledWith('call-1');
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      'call.ended',
      expect.objectContaining({
        callId: 'call-1',
        reason: 'cancelled',
      }),
    );
  });
});
