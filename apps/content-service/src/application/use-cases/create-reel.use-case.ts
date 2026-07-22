import { CreateReelDto } from '@common/content/dtos/create-reel.dto';
import { REEL_MEDIA_JOB_EVENT_TYPE } from '@common/processing/interfaces/reel-media-job.interface';
import { InvalidMediaFileError } from '@content/domain/errors/content.error';
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';
import type { IStorageService } from '../../domain/interfaces/storage.service.interface';
import { BuildReelMediaJobUseCase } from './build-reel-media-job.use-case';

@Injectable()
export class CreateReelUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
    @Inject('IStorageService')
    private readonly storageService: IStorageService,
    private readonly buildReelMediaJobUseCase: BuildReelMediaJobUseCase,
  ) {}

  async execute(userId: string, payload: CreateReelDto) {
    const fileExists = await this.storageService.checkFileExists(
      payload.mediaKey,
    );

    if (!fileExists) {
      throw new InvalidMediaFileError();
    }

    const reelId = randomUUID();
    const processingAttemptId = randomUUID();
    const mediaJob = this.buildReelMediaJobUseCase.execute({
      reelId,
      userId,
      mediaKey: payload.mediaKey,
      mediaAttemptId: processingAttemptId,
      clientObservedDurationMs: payload.clientObservedDurationMs,
      title: payload.title,
      description: payload.description,
      tags: payload.tags,
    });

    return await this.contentRepository.createReelWithMediaJob(
      {
        id: reelId,
        userId,
        mediaKey: payload.mediaKey,
        title: payload.title,
        description: payload.description,
        tags: payload.tags,
        visibility: payload.visibility,
        status: 'PENDING',
        processingStage: 'QUEUED',
        processingMessage: 'Queued for processing',
        processingProgress: 0,
        processingAttemptId,
      },
      {
        id: mediaJob.jobId,
        eventType: REEL_MEDIA_JOB_EVENT_TYPE,
        payload: mediaJob,
        createdAt: new Date(mediaJob.createdAt),
      },
    );
  }
}
