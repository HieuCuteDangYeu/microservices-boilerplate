import {
  InvalidMediaFileError,
  ReelAlreadyProcessingError,
  ReelNotFoundError,
  ReelReprocessForbiddenError,
} from '@content/domain/errors/content.error';
import type { IProcessingService } from '@content/domain/interfaces/processing-service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';
import type { IStorageService } from '../../domain/interfaces/storage.service.interface';

@Injectable()
export class ReprocessReelUseCase {
  private readonly logger = new Logger(ReprocessReelUseCase.name);

  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
    @Inject('IStorageService')
    private readonly storageService: IStorageService,
    @Inject('IProcessingService')
    private readonly processingService: IProcessingService,
  ) {}

  async execute(reelId: string, userId: string, isAdmin = false) {
    const reel = await this.contentRepository.findById(reelId);

    if (!reel) {
      throw new ReelNotFoundError();
    }

    if (reel.userId !== userId && !isAdmin) {
      throw new ReelReprocessForbiddenError();
    }

    if (reel.status === 'PENDING' || reel.status === 'PROCESSING') {
      throw new ReelAlreadyProcessingError();
    }

    if (!reel.mediaKey?.trim()) {
      throw new InvalidMediaFileError();
    }

    const fileExists = await this.storageService.checkFileExists(reel.mediaKey);

    if (!fileExists) {
      throw new InvalidMediaFileError();
    }

    const queuedReel = await this.contentRepository.updateReelStatus(
      reel.id,
      'PENDING',
      undefined,
      undefined,
      undefined,
      undefined,
      'QUEUED',
      'Queued for processing',
      0,
    );

    try {
      await this.processingService.emitReelCreated({
        reelId: reel.id,
        mediaKey: reel.mediaKey,
        userId: reel.userId,
        title: reel.title,
        description: reel.description,
        tags: reel.tags,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to enqueue reel ${reel.id} for reprocessing: ${message}`,
      );

      return await this.contentRepository.updateReelStatus(
        reel.id,
        'FAILED',
        undefined,
        undefined,
        undefined,
        undefined,
        'FAILED',
        'Video processing failed',
        0,
      );
    }

    return queuedReel;
  }
}
