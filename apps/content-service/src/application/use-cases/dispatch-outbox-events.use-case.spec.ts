/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

/* eslint-disable @typescript-eslint/unbound-method */

import {
  REEL_MEDIA_JOB_EVENT_TYPE,
  ReelMediaJob,
} from '@common/processing/interfaces/reel-media-job.interface';
import {
  REEL_INDEX_JOB_EVENT_TYPE,
  type ReelIndexJob,
} from '@common/processing/interfaces/reel-index-job.interface';
import { OutboxEvent } from '@content/domain/entities/outbox-event.entity';
import type { IOutboxRepository } from '@content/domain/interfaces/outbox.repository.interface';
import type { IReelMediaJobPublisher } from '@content/domain/interfaces/reel-media-job-publisher.interface';
import type { IReelIndexJobPublisher } from '@content/domain/interfaces/reel-index-job-publisher.interface';
import { DispatchOutboxEventsUseCase } from './dispatch-outbox-events.use-case';

function buildJob(): ReelMediaJob {
  return {
    jobId: 'job-1',
    reelId: 'reel-1',
    userId: 'user-1',
    mediaKey: 'reels/user-1/reel-1.mp4',
    mediaAttemptId: 'attempt-1',
    expectedLengthClass: 'SHORT',
    tags: [],
    createdAt: '2026-07-22T00:00:00.000Z',
    schemaVersion: 1,
  };
}

function buildEvent(): OutboxEvent {
  return Object.assign(new OutboxEvent(), {
    id: 'job-1',
    aggregateType: 'REEL',
    aggregateId: 'reel-1',
    eventType: REEL_MEDIA_JOB_EVENT_TYPE,
    payload: buildJob(),
    createdAt: new Date('2026-07-22T00:00:00.000Z'),
    attemptCount: 1,
    nextAttemptAt: new Date('2026-07-22T00:00:00.000Z'),
  });
}

describe('DispatchOutboxEventsUseCase', () => {
  const indexPublisher: IReelIndexJobPublisher = {
    publish: jest.fn().mockResolvedValue(undefined),
  };

  it('routes a committed index outbox event to the index publisher', async () => {
    const indexJob: ReelIndexJob = {
      jobId: 'index-job-1',
      reelId: 'reel-1',
      userId: 'user-1',
      mediaAttemptId: 'media-1',
      indexAttemptId: 'index-1',
      indexVersion: 'v1',
      mediaKey: 'reels/source.mp4',
      sourceDurationMs: 10_000,
      sourceOrientation: 'PORTRAIT',
      sourceLengthClass: 'SHORT',
      tags: [],
      createdAt: '2026-07-22T00:00:00.000Z',
      schemaVersion: 1,
    };
    const event = Object.assign(new OutboxEvent(), {
      id: indexJob.jobId,
      aggregateType: 'REEL',
      aggregateId: indexJob.reelId,
      eventType: REEL_INDEX_JOB_EVENT_TYPE,
      payload: indexJob,
      createdAt: new Date(indexJob.createdAt),
      attemptCount: 1,
      nextAttemptAt: new Date(indexJob.createdAt),
    });
    const repository: IOutboxRepository = {
      claimPending: jest.fn().mockResolvedValue([event]),
      markPublished: jest.fn().mockResolvedValue(true),
      markFailed: jest.fn().mockResolvedValue(true),
    };
    const mediaPublisher: IReelMediaJobPublisher = { publish: jest.fn() };
    const localIndexPublisher: IReelIndexJobPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const result = await new DispatchOutboxEventsUseCase(
      repository,
      mediaPublisher,
      localIndexPublisher,
    ).execute({ batchSize: 25, staleClaimMs: 60_000 });

    expect(result).toEqual({ claimed: 1, published: 1, failed: 0 });
    expect(localIndexPublisher.publish).toHaveBeenCalledWith(indexJob);
    expect(mediaPublisher.publish).not.toHaveBeenCalled();
  });

  it('recovers an event left committed when the creator process stops', async () => {
    const event = buildEvent();
    const repository: IOutboxRepository = {
      claimPending: jest.fn().mockResolvedValue([event]),
      markPublished: jest.fn().mockResolvedValue(true),
      markFailed: jest.fn().mockResolvedValue(true),
    };
    const publisher: IReelMediaJobPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new DispatchOutboxEventsUseCase(
      repository,
      publisher,
      indexPublisher,
    );

    await expect(
      useCase.execute({ batchSize: 25, staleClaimMs: 60_000 }),
    ).resolves.toEqual({ claimed: 1, published: 1, failed: 0 });
    expect(publisher.publish).toHaveBeenCalledWith(event.payload);
    expect(repository.markPublished).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: event.id }),
    );
  });

  it('records a retryable outbox failure and publishes on recovery', async () => {
    const event = buildEvent();
    const repository: IOutboxRepository = {
      claimPending: jest
        .fn()
        .mockResolvedValueOnce([event])
        .mockResolvedValueOnce([{ ...event, attemptCount: 2 }]),
      markPublished: jest.fn().mockResolvedValue(true),
      markFailed: jest.fn().mockResolvedValue(true),
    };
    const publisher: IReelMediaJobPublisher = {
      publish: jest
        .fn()
        .mockRejectedValueOnce(new Error('broker unavailable'))
        .mockResolvedValueOnce(undefined),
    };
    const useCase = new DispatchOutboxEventsUseCase(
      repository,
      publisher,
      indexPublisher,
    );

    await expect(
      useCase.execute({ batchSize: 25, staleClaimMs: 60_000 }),
    ).resolves.toEqual({ claimed: 1, published: 0, failed: 1 });
    await expect(
      useCase.execute({ batchSize: 25, staleClaimMs: 60_000 }),
    ).resolves.toEqual({ claimed: 1, published: 1, failed: 0 });
    expect(repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: event.id,
        lastError: 'broker unavailable',
      }),
    );
  });

  it('allows only one dispatcher to receive a safely claimed event', async () => {
    const event = buildEvent();
    let available = true;
    const repository: IOutboxRepository = {
      claimPending: jest.fn().mockImplementation(() => {
        if (!available) return Promise.resolve([]);
        available = false;
        return Promise.resolve([event]);
      }),
      markPublished: jest.fn().mockResolvedValue(true),
      markFailed: jest.fn().mockResolvedValue(true),
    };
    const publisher: IReelMediaJobPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };
    const first = new DispatchOutboxEventsUseCase(
      repository,
      publisher,
      indexPublisher,
    );
    const second = new DispatchOutboxEventsUseCase(
      repository,
      publisher,
      indexPublisher,
    );

    const results = await Promise.all([
      first.execute({ batchSize: 25, staleClaimMs: 60_000 }),
      second.execute({ batchSize: 25, staleClaimMs: 60_000 }),
    ]);

    expect(results.map((result) => result.claimed).sort()).toEqual([0, 1]);
    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });
});
