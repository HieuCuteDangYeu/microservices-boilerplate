import {
  InvalidMediaFileError,
  ReelAlreadyProcessingError,
  ReelNotFoundError,
  ReelReprocessForbiddenError,
} from '@content/domain/errors/content.error';
import type { IProcessingService } from '@content/domain/interfaces/processing-service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Reel } from '../../domain/entities/reel.entity';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';
import type { IStorageService } from '../../domain/interfaces/storage.service.interface';

const DEFAULT_STALE_PROCESSING_MS = 30 * 60 * 1000;

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

    if (this.isActiveAndNotStale(reel)) {
      throw new ReelAlreadyProcessingError();
    }

    if (!reel.mediaKey?.trim()) {
      throw new InvalidMediaFileError();
    }

    const fileExists = await this.storageService.checkFileExists(reel.mediaKey);

    if (!fileExists) {
      throw new InvalidMediaFileError();
    }

    const processingAttemptId = randomUUID();

    const queuedReel = await this.contentRepository.queueReelProcessingAttempt(
      reel.id,
      processingAttemptId,
    );

    try {
      await this.processingService.emitReelCreated({
        reelId: reel.id,
        mediaKey: reel.mediaKey,
        userId: reel.userId,
        processingAttemptId,
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
    }

    return queuedReel;
  }

  private isActiveAndNotStale(reel: Reel): boolean {
    if (reel.status !== 'PENDING' && reel.status !== 'PROCESSING') {
      return false;
    }

    const anchor =
      reel.processingStartedAt ?? reel.updatedAt ?? reel.createdAt ?? null;

    if (!anchor) {
      return false;
    }

    return Date.now() - anchor.getTime() < DEFAULT_STALE_PROCESSING_MS;
  }
}
