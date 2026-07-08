import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { buildCallLifecycleMetadata } from './call-lifecycle-payload';
import type { CallSession } from '../../domain/entities/call-session.entity';
import { ICallEventPublisher } from '../../domain/interfaces/call-event.publisher.interface';
import { ICallMediaEngine } from '../../domain/interfaces/call-media.engine.interface';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';
import { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

export interface RejectCallResult {
  session: CallSession;
  reason: string;
}

@Injectable()
export class RejectCallUseCase {
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
    reason = 'rejected',
  ): Promise<RejectCallResult> {
    const session = await this.sessionRepository.findByCallId(callId);
    if (!session) {
      throw new NotFoundException('Call not found');
    }

    if (userId !== session.targetUserId) {
      throw new ForbiddenException('Only the callee can reject this call');
    }

    if (session.status === 'active') {
      throw new ForbiddenException('Active calls cannot be rejected');
    }

    const now = new Date();
    session.status = 'rejected';
    session.endedAt = now;
    session.updatedAt = now;

    await this.eventPublisher.publish('call.rejected', {
      callId,
      conversationId: session.conversationId,
      initiatorId: session.initiatorId,
      targetUserId: session.targetUserId,
      userId,
      callType: session.callType,
      ...buildCallLifecycleMetadata(session, now),
      reason,
      at: now.toISOString(),
    });

    await this.mediaEngine.closeRoom(callId);
    await this.stateRepository.clearCallState(callId);
    await this.sessionRepository.delete(callId);

    return { session, reason };
  }
}
