import { Inject, Injectable } from '@nestjs/common';
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

  async execute(roomId: string, userId: string): Promise<void> {
    await this.sessionRepository.updateStatus(roomId, 'active');
    await this.eventPublisher.publish('call.answered', {
      roomId,
      userId,
      at: new Date().toISOString(),
    });
  }
}
