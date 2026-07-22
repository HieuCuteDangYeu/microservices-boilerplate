/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import { REEL_INDEX_JOB_EVENT_TYPE } from '@common/processing/interfaces/reel-index-job.interface';
import { ContentRepository } from './content.repository';

describe('ContentRepository Phase 4 index handoff', () => {
  it('commits the guarded media completion and exact index job atomically', async () => {
    const reel = {
      id: 'reel-1',
      userId: 'user-1',
      mediaKey: 'reels/source.mp4',
      title: 'Title',
      description: 'Description',
      tags: ['tag'],
      indexAttemptId: 'index-1',
    };
    const transaction = {
      reel: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(reel),
      },
      outboxEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const repository = Object.create(
      ContentRepository.prototype,
    ) as ContentRepository;
    Object.defineProperty(repository, 'configService', {
      value: { get: jest.fn().mockReturnValue('reel-index-v1') },
    });
    Object.defineProperty(repository, '$transaction', {
      value: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    });

    await expect(
      repository.completeMediaProcessing({
        reelId: reel.id,
        mediaAttemptId: 'media-1',
        mediaMetadata: {
          sourceDurationMs: 12_000,
          sourceOrientation: 'PORTRAIT',
        },
        mediaOutput: {
          hlsMasterKey: 'reels/hls/master.m3u8',
          thumbnailKey: 'reels/thumbnail.jpg',
          transcriptionAudioManifestKey: 'reels/audio/manifest.json',
          sourceLengthClass: 'SHORT',
          variants: [],
          hlsObjectCount: 1,
          hlsTotalBytes: 100,
          checksums: {
            sourceSha256: 'source',
            hlsMasterSha256: 'master',
            thumbnailSha256: 'thumbnail',
            transcriptionAudioManifestSha256: 'manifest',
          },
        },
      }),
    ).resolves.toBe(true);

    const [call] = transaction.outboxEvent.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(call.data).toMatchObject({
      aggregateType: 'REEL',
      aggregateId: reel.id,
      eventType: REEL_INDEX_JOB_EVENT_TYPE,
      payload: {
        reelId: reel.id,
        userId: reel.userId,
        mediaAttemptId: 'media-1',
        indexAttemptId: reel.indexAttemptId,
        indexVersion: 'reel-index-v1',
        mediaKey: reel.mediaKey,
        transcriptionAudioManifestKey: 'reels/audio/manifest.json',
        sourceDurationMs: 12_000,
        sourceOrientation: 'PORTRAIT',
        sourceLengthClass: 'SHORT',
        schemaVersion: 1,
      },
    });
  });
});
