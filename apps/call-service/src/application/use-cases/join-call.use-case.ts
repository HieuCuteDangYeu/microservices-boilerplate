import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CallParticipant } from '../../domain/entities/call-participant.entity';
import { CallSession } from '../../domain/entities/call-session.entity';
import {
  ICallMediaEngine,
  type RouterRtpCapabilitiesResult,
} from '../../domain/interfaces/call-media.engine.interface';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';
import { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

export interface JoinCallResult {
  role: 'host' | 'guest';
  session: CallSession;
  rtpCapabilities: RouterRtpCapabilitiesResult;
  peerUserId?: string;
  shouldEmitNewPeer: boolean;
}

@Injectable()
export class JoinCallUseCase {
  constructor(
    @Inject('ICallSessionRepository')
    private readonly sessionRepository: ICallSessionRepository,
    @Inject('ICallStateRepository')
    private readonly stateRepository: ICallStateRepository,
    @Inject('ICallMediaEngine') private readonly mediaEngine: ICallMediaEngine,
  ) {}

  async execute(
    callId: string,
    userId: string,
    socketId: string,
  ): Promise<JoinCallResult> {
    const now = new Date();
    const session = await this.sessionRepository.findByCallId(callId);

    if (!session) {
      throw new NotFoundException('Call not found');
    }

    if (session.status === 'ended' || session.status === 'cancelled') {
      throw new ForbiddenException('Call is no longer active');
    }

    if (userId !== session.initiatorId && userId !== session.targetUserId) {
      throw new ForbiddenException('You are not part of this call');
    }

    const role = session.initiatorId === userId ? 'host' : 'guest';
    const existingParticipants = new Set(session.participantIds);
    const isNewParticipant = !existingParticipants.has(userId);

    if (isNewParticipant) {
      session.participantIds = [...session.participantIds, userId];
    }

    if (role === 'guest' && session.status === 'initiated') {
      session.status = 'ringing';
    }

    session.updatedAt = now;
    await this.sessionRepository.save(session);

    await this.stateRepository.upsertParticipant(
      new CallParticipant({
        userId,
        callId,
        role,
        socketId,
        isConnected: true,
        joinedAt: now,
      }),
    );

    const peerUserId =
      role === 'host' ? session.targetUserId : session.initiatorId;

    return {
      role,
      session,
      rtpCapabilities: await this.mediaEngine.getRouterRtpCapabilities(callId),
      peerUserId,
      shouldEmitNewPeer: isNewParticipant && role === 'guest',
    };
  }
}
