/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

/* eslint-disable @typescript-eslint/unbound-method */

import { REEL_MEDIA_JOB_EVENT_TYPE } from '@common/processing/interfaces/reel-media-job.interface';
import { Reel } from '@content/domain/entities/reel.entity';
import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import type { IStorageService } from '@content/domain/interfaces/storage.service.interface';
import { ConfigService } from '@nestjs/config';
import { BuildReelMediaJobUseCase } from './build-reel-media-job.use-case';
import { ClassifyReelJobLengthUseCase } from './classify-reel-job-length.use-case';
import { CreateReelUseCase } from './create-reel.use-case';

describe('CreateReelUseCase Phase 1 outbox boundary', () => {
  it('submits Reel and media job through one transactional repository call', async () => {
    const savedReel = Object.assign(new Reel(), { id: 'saved-reel' });
    const repository = {
      createReelWithMediaJob: jest.fn().mockResolvedValue(savedReel),
    } as unknown as IContentRepository;
    const storage = {
      checkFileExists: jest.fn().mockResolvedValue(true),
    } as unknown as IStorageService;
    const classifier = new ClassifyReelJobLengthUseCase(
      new ConfigService({ MEDIA_SHORT_MAX_DURATION_SECONDS: '180' }),
    );
    const useCase = new CreateReelUseCase(
      repository,
      storage,
      new BuildReelMediaJobUseCase(classifier),
    );

    await expect(
      useCase.execute('user-1', {
        mediaKey: 'reels/user-1/source.mp4',
        title: 'A reel',
        tags: ['phase-1'],
        visibility: 'public',
        clientObservedDurationMs: 45_000,
      }),
    ).resolves.toBe(savedReel);

    expect(repository.createReelWithMediaJob).toHaveBeenCalledTimes(1);
    const [reel, outbox] = (
      repository.createReelWithMediaJob as jest.MockedFunction<
        IContentRepository['createReelWithMediaJob']
      >
    ).mock.calls[0];

    expect(outbox.eventType).toBe(REEL_MEDIA_JOB_EVENT_TYPE);
    expect(outbox.id).toBe(outbox.payload.jobId);
    expect(outbox.payload).toMatchObject({
      reelId: reel.id,
      userId: 'user-1',
      mediaKey: 'reels/user-1/source.mp4',
      mediaAttemptId: reel.processingAttemptId,
      expectedLengthClass: 'SHORT',
      schemaVersion: 1,
    });
  });
});
