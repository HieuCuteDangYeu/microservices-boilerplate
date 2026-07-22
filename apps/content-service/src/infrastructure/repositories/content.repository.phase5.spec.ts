/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import { REEL_INDEX_JOB_EVENT_TYPE } from '@common/processing/interfaces/reel-index-job.interface';
import { ContentRepository } from './content.repository';

describe('ContentRepository Phase 5 reindex operations', () => {
  const reel = {
    id: 'reel-1',
    userId: 'user-1',
    mediaKey: 'reels/source.mp4',
    mediaAttemptId: 'media-1',
    processingAttemptId: 'media-1',
    indexAttemptId: 'old-index',
    mediaStatus: 'COMPLETED',
    title: 'Title',
    description: 'Description',
    tags: ['topic'],
    transcriptionAudioManifestKey: 'reels/audio/manifest.json',
    sourceDurationMs: 90_000,
    sourceOrientation: 'PORTRAIT',
    sourceLengthClass: 'SHORT',
  } as const;

  function setup(updateCount: number) {
    const transaction = {
      reel: {
        findFirst: jest.fn().mockResolvedValue(reel),
        updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const repository = Object.create(
      ContentRepository.prototype,
    ) as ContentRepository;
    Object.defineProperty(repository, 'configService', {
      value: { get: jest.fn().mockReturnValue('reel-index-v2') },
    });
    Object.defineProperty(repository, '$transaction', {
      value: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    });
    return { repository, transaction };
  }

  it('atomically creates a new versioned index attempt and outbox job', async () => {
    const { repository, transaction } = setup(1);
    const indexAttemptId = await repository.queueReelIndexingAttempt(reel.id);
    expect(indexAttemptId).toEqual(expect.any(String));
    expect(indexAttemptId).not.toBe(reel.indexAttemptId);
    const [updateCall] = transaction.reel.updateMany.mock.calls[0] as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    expect(updateCall.where).toMatchObject({
      indexAttemptId: reel.indexAttemptId,
    });
    expect(updateCall.data).toMatchObject({
      indexAttemptId,
      indexStatus: 'PENDING',
      processingStage: 'INDEX_QUEUED',
    });
    const [call] = transaction.outboxEvent.create.mock.calls[0] as [
      { data: { eventType: string; payload: Record<string, unknown> } },
    ];
    expect(call.data.eventType).toBe(REEL_INDEX_JOB_EVENT_TYPE);
    expect(call.data.payload).toMatchObject({
      reelId: reel.id,
      mediaAttemptId: reel.mediaAttemptId,
      indexAttemptId,
      indexVersion: 'reel-index-v2',
      schemaVersion: 1,
    });
  });

  it('does not create an outbox job after losing the attempt race', async () => {
    const { repository, transaction } = setup(0);
    await expect(
      repository.queueReelIndexingAttempt(reel.id),
    ).resolves.toBeNull();
    expect(transaction.outboxEvent.create).not.toHaveBeenCalled();
  });
});
