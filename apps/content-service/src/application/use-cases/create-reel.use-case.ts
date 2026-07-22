import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { InvalidMediaFileError } from '@content/domain/errors/content.error';
import type { IProcessingService } from '@content/domain/interfaces/processing-service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';
import type { IStorageService } from '../../domain/interfaces/storage.service.interface';

@Injectable()
export class CreateReelUseCase {
  private readonly logger = new Logger(CreateReelUseCase.name);

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

    const processingAttemptId = randomUUID();

    const savedReel = await this.contentRepository.createReel({
      ...payload,
      userId,
      status: 'PENDING',
      processingStage: 'QUEUED',
      processingMessage: 'Queued for processing',
      processingProgress: 0,
      processingAttemptId,
      processingStartedAt: undefined,
      processingFailedAt: undefined,
      processingCompletedAt: undefined,
      processingErrorCode: undefined,
      processingErrorDetail: undefined,
    });

    try {
      await this.processingService.emitReelCreated({
        reelId: savedReel.id,
        mediaKey: savedReel.mediaKey,
        userId,
        processingAttemptId,
        queuedAt: new Date().toISOString(),
        title: savedReel.title,
        description: savedReel.description,
        tags: savedReel.tags,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      const failedReel = await this.contentRepository.updateReelStatus(
        savedReel.id,
        'FAILED',
        undefined,
        undefined,
        undefined,
        undefined,
        'QUEUE_PUBLISH_FAILED',
        'Video processing failed',
        0,
        undefined,
        undefined,
        undefined,
        undefined,
        processingAttemptId,
        'QUEUE_PUBLISH_FAILED',
        message,
      );

      this.logger.error(
        `Failed to enqueue reel ${savedReel.id} for processing: ${message}`,
      );

      return failedReel;
    }

    return savedReel;
  }
}
