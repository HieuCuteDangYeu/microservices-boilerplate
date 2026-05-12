import { Inject, Injectable } from '@nestjs/common';
import { ICallEventPublisher } from '../../domain/interfaces/call-event.publisher.interface';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';

@Injectable()
export class RejectCallUseCase {
  constructor(
    @Inject('ICallSessionRepository')
    private readonly sessionRepository: ICallSessionRepository,
    @Inject('ICallEventPublisher')
    private readonly eventPublisher: ICallEventPublisher,
  ) {}

  async execute(
    roomId: string,
    userId: string,
    reason = 'rejected',
  ): Promise<void> {
    await this.sessionRepository.updateStatus(roomId, 'rejected');
    await this.eventPublisher.publish('call.rejected', {
      roomId,
      userId,
      reason,
      at: new Date().toISOString(),
    });
  }
}
