import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { buildCallLifecycleMetadata } from './call-lifecycle-payload';
import { ICallEventPublisher } from '../../domain/interfaces/call-event.publisher.interface';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';

@Injectable()
export class AnswerCallUseCase {
  constructor(
    @Inject('ICallSessionRepository')
    private readonly sessionRepository: ICallSessionRepository,
    @Inject('ICallEventPublisher')
    private readonly eventPublisher: ICallEventPublisher,
  ) {}

  async execute(callId: string, userId: string): Promise<void> {
    const session = await this.sessionRepository.findByCallId(callId);
    if (!session) {
      throw new NotFoundException('Call not found');
    }

    if (userId !== session.targetUserId) {
      throw new ForbiddenException('Only the callee can answer this call');
    }

    if (session.status !== 'ringing') {
      throw new ForbiddenException(
        'Call cannot be answered in its current state',
      );
    }

    const now = new Date();
    session.status = 'active';
    session.answeredAt = now;
    session.updatedAt = now;
    await this.sessionRepository.save(session);

    await this.eventPublisher.publish('call.answered', {
      callId,
      conversationId: session.conversationId,
      initiatorId: session.initiatorId,
      targetUserId: session.targetUserId,
      userId,
      callType: session.callType,
      ...buildCallLifecycleMetadata(session, now),
      at: now.toISOString(),
    });
  }
}
