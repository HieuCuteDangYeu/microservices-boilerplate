import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CallSession } from '../../domain/entities/call-session.entity';
import { ICallEventPublisher } from '../../domain/interfaces/call-event.publisher.interface';
import { ICallMediaEngine } from '../../domain/interfaces/call-media.engine.interface';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';
import { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

export interface LeaveCallResult {
  session: CallSession;
  endedReason: string;
  shouldEmitPeerLeft: boolean;
}

@Injectable()
export class LeaveCallUseCase {
  constructor(
    @Inject('ICallSessionRepository')
    private readonly sessionRepository: ICallSessionRepository,
    @Inject('ICallStateRepository')
    private readonly stateRepository: ICallStateRepository,
    @Inject('ICallEventPublisher')
    private readonly eventPublisher: ICallEventPublisher,
    @Inject('ICallMediaEngine') private readonly mediaEngine: ICallMediaEngine,
  ) {}

  async execute(
    callId: string,
    userId: string,
    requestedReason?: string,
  ): Promise<LeaveCallResult> {
    const session = await this.sessionRepository.findByCallId(callId);
    if (!session) {
      throw new NotFoundException('Call not found');
    }

    if (!session.participantIds.includes(userId)) {
      throw new ForbiddenException('You are not part of this call');
    }

    const now = new Date();
    const wasActive = session.status === 'active';
    const endedReason = wasActive
      ? (requestedReason ?? 'ended')
      : userId === session.initiatorId
        ? (requestedReason ?? 'cancelled')
        : (requestedReason ?? 'ended');

    session.status = endedReason === 'cancelled' ? 'cancelled' : 'ended';
    session.endedAt = now;
    session.updatedAt = now;

    await this.eventPublisher.publish('call.ended', {
      callId,
      conversationId: session.conversationId,
      initiatorId: session.initiatorId,
      targetUserId: session.targetUserId,
      userId,
      callType: session.callType,
      reason: endedReason,
      at: now.toISOString(),
    });

    await this.mediaEngine.closeRoom(callId);
    await this.stateRepository.clearCallState(callId);
    await this.sessionRepository.delete(callId);

    return {
      session,
      endedReason,
      shouldEmitPeerLeft: wasActive,
    };
  }
}
