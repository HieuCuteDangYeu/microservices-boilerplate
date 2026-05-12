import { Inject, Injectable } from '@nestjs/common';
import { CallParticipant } from '../../domain/entities/call-participant.entity';
import { CallSession } from '../../domain/entities/call-session.entity';
import { ICallEventPublisher } from '../../domain/interfaces/call-event.publisher.interface';
import { ICallMediaEngine } from '../../domain/interfaces/call-media.engine.interface';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';
import { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

@Injectable()
export class JoinRoomUseCase {
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
    socketId: string,
  ): Promise<CallSession> {
    const now = new Date();
    let session = await this.sessionRepository.findByRoomId(roomId);

    await this.mediaEngine.createRoom(roomId);

    if (!session) {
      session = new CallSession({
        id: roomId,
        roomId,
        initiatorId: userId,
        status: 'ringing',
        participantIds: [userId],
        createdAt: now,
        updatedAt: now,
      });
    } else if (!session.participantIds.includes(userId)) {
      session.participantIds = [...session.participantIds, userId];
      session.updatedAt = now;
    }

    await this.sessionRepository.save(session);
    await this.stateRepository.upsertParticipant(
      new CallParticipant({
        userId,
        roomId,
        role: session.initiatorId === userId ? 'host' : 'guest',
        socketId,
        isConnected: true,
        joinedAt: now,
      }),
    );

    await this.eventPublisher.publish('call.initiated', {
      roomId,
      userId,
      at: now.toISOString(),
    });

    return session;
  }
}
