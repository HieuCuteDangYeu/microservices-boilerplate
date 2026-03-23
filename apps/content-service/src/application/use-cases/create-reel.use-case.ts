import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Reel } from '../../domain/entities/reel.entity';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class CreateReelUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
    @Inject('CONTENT_RMQ') private readonly messageBroker: ClientProxy,
  ) {}

  async execute(userId: string, payload: CreateReelDto) {
    const reel = new Reel();
    reel.userId = userId;
    reel.mediaKey = payload.mediaKey;
    reel.title = payload.title;
    reel.description = payload.description;
    reel.tags = payload.tags ?? [];
    reel.status = 'PENDING';

    const savedReel = await this.contentRepository.createReel(reel);

    this.messageBroker.emit('reel.created', {
      reelId: savedReel.id,
      mediaKey: savedReel.mediaKey,
      userId: userId,
    });

    return savedReel;
  }
}
