import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { InvalidMediaFileError } from '@content/domain/errors/content.error';
import type { IProcessingService } from '@content/domain/interfaces/processing-service.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';
import type { IStorageService } from '../../domain/interfaces/storage.service.interface';

@Injectable()
export class CreateReelUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
    @Inject('IStorageService')
    private readonly storageService: IStorageService,
    @Inject('IProcessingService')
    private readonly processingService: IProcessingService,
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

    this.processingService.emitReelCreated({
      reelId: savedReel.id,
      mediaKey: savedReel.mediaKey,
      userId: userId,
    });

    return savedReel;
  }
}
