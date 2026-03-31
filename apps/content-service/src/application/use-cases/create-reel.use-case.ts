import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { InvalidMediaFileError } from '@content/domain/errors/content.error';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';
import type { IStorageService } from '../../domain/interfaces/storage.service.interface';

@Injectable()
export class CreateReelUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
    @Inject('IStorageService')
    private readonly storageService: IStorageService,
    @Inject('PROCESSING_SERVICE')
    private readonly messageBroker: ClientProxy,
  ) {}

  async execute(userId: string, payload: CreateReelDto) {
    const fileExists = await this.storageService.checkFileExists(
      payload.mediaKey,
    );

    if (!fileExists) {
      throw new InvalidMediaFileError();
    }

    const savedReel = await this.contentRepository.createReel({
      ...payload,
      userId,
      status: 'PENDING',
    });

    this.messageBroker.emit('reel.created', {
      reelId: savedReel.id,
      mediaKey: savedReel.mediaKey,
      userId: userId,
    });

    return savedReel;
  }
}
