import { Inject, Injectable } from '@nestjs/common';
import { ICallEventPublisher } from '../../domain/interfaces/call-event.publisher.interface';
import { ICallMediaEngine } from '../../domain/interfaces/call-media.engine.interface';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';
import { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

@Injectable()
export class EndCallUseCase {
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
    roomId: string,
    userId: string,
    reason = 'ended',
  ): Promise<void> {
    await this.sessionRepository.updateStatus(roomId, 'ended');
    await this.mediaEngine.closeRoom(roomId);
    await this.eventPublisher.publish('call.ended', {
      roomId,
      userId,
      reason,
      at: new Date().toISOString(),
    });

    const participants = await this.stateRepository.getParticipants(roomId);
    await Promise.all(
      participants.map((participant) =>
        this.stateRepository.removeParticipant(roomId, participant.userId),
      ),
    );
  }
}
