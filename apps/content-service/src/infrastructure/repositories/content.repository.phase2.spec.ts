/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import { ContentRepository } from './content.repository';

describe('ContentRepository Phase 2 state guards', () => {
  interface UpdateManyCall {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }

  function createRepositoryWithReelDelegate(
    reel: Record<string, jest.Mock>,
  ): ContentRepository {
    const repository = Object.create(
      ContentRepository.prototype,
    ) as ContentRepository;

    Object.defineProperty(repository, 'reel', { value: reel });
    Object.defineProperty(repository, '$transaction', {
      value: jest.fn(
        async (callback: (tx: { reel: typeof reel }) => Promise<unknown>) =>
          await callback({ reel }),
      ),
    });

    return repository;
  }

  it('rejects a stale media attempt without changing readiness', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = createRepositoryWithReelDelegate({ updateMany });

    await expect(
      repository.completeMediaProcessing({
        reelId: 'reel-1',
        mediaAttemptId: 'stale-media-attempt',
        mediaMetadata: {},
        mediaOutput: {
          hlsMasterKey: 'reels/reel-1/hls/master.m3u8',
          thumbnailKey: 'reels/reel-1/thumbnail.jpg',
          transcriptionAudioManifestKey:
            'reels/reel-1/transcription/attempt/manifest.json',
          sourceLengthClass: 'SHORT',
          variants: [],
          hlsObjectCount: 1,
          hlsTotalBytes: 1,
          checksums: {
            sourceSha256: 'source',
            hlsMasterSha256: 'master',
            thumbnailSha256: 'thumbnail',
            transcriptionAudioManifestSha256: 'manifest',
          },
        },
      }),
    ).resolves.toBe(false);

    expect(updateMany).toHaveBeenCalledTimes(1);
    const [call] = updateMany.mock.calls[0] as [UpdateManyCall];

    expect(call.where).toEqual({
      id: 'reel-1',
      mediaAttemptId: 'stale-media-attempt',
      mediaStatus: { in: ['PROBING', 'PROCESSING'] },
    });
    expect(call.data).toMatchObject({
      status: 'COMPLETED',
      mediaStatus: 'COMPLETED',
      indexStatus: 'PENDING',
    });
  });

  it('rejects stale index completion without replacing chunks', async () => {
    const transaction = {
      reel: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      reelChunk: { deleteMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const repository = Object.create(
      ContentRepository.prototype,
    ) as ContentRepository;
    Object.defineProperty(repository, '$transaction', {
      value: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    });

    await expect(
      repository.completeIndexing({
        reelId: 'reel-1',
        indexAttemptId: 'stale-index-attempt',
        metadata: { tags: [] },
        chunks: [],
      }),
    ).resolves.toBe(false);
    expect(transaction.reelChunk.deleteMany).not.toHaveBeenCalled();
  });

  it('accepts an already completed current attempt without rewriting chunks', async () => {
    const transaction = {
      reel: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'reel-1',
          indexAttemptId: 'index-attempt-current',
          indexStatus: 'COMPLETED',
        }),
        updateMany: jest.fn(),
      },
      reelChunk: { deleteMany: jest.fn() },
      $executeRaw: jest.fn(),
    };
    const repository = Object.create(
      ContentRepository.prototype,
    ) as ContentRepository;
    Object.defineProperty(repository, '$transaction', {
      value: jest.fn((callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    });

    await expect(
      repository.completeIndexing({
        reelId: 'reel-1',
        indexAttemptId: 'index-attempt-current',
        metadata: { tags: [] },
        chunks: [],
      }),
    ).resolves.toBe(true);
    expect(transaction.reel.updateMany).not.toHaveBeenCalled();
    expect(transaction.reelChunk.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects a stale index attempt', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const repository = createRepositoryWithReelDelegate({ updateMany });

    await expect(
      repository.updateIndexStatus({
        reelId: 'reel-1',
        indexAttemptId: 'stale-index-attempt',
        indexStatus: 'FAILED',
      }),
    ).resolves.toBe(false);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reel-1',
        indexAttemptId: 'stale-index-attempt',
        mediaStatus: 'COMPLETED',
      },
      data: { indexStatus: 'FAILED' },
    });
  });

  it('keeps completed media playable when indexing fails', async () => {
    const now = new Date('2026-07-22T00:00:00.000Z');
    const currentRecord = {
      id: 'reel-1',
      userId: 'user-1',
      mediaKey: 'reels/reel-1/master.m3u8',
      tags: [],
      status: 'COMPLETED',
      mediaStatus: 'COMPLETED',
      indexStatus: 'PROCESSING',
      visibility: 'public',
      viewCount: 0n,
      mediaAttemptId: 'media-attempt-current',
      indexAttemptId: 'index-attempt-current',
      createdAt: now,
      updatedAt: now,
    };
    let persistedData: Record<string, unknown> = {};
    const transaction = {
      reel: {
        findUnique: jest.fn().mockResolvedValue(currentRecord),
        updateMany: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            persistedData = data;
            return Promise.resolve({ count: 1 });
          }),
        findUniqueOrThrow: jest.fn().mockImplementation(() =>
          Promise.resolve({
            ...currentRecord,
            ...persistedData,
          }),
        ),
      },
    };
    const repository = Object.create(
      ContentRepository.prototype,
    ) as ContentRepository;

    Object.defineProperty(repository, '$transaction', {
      value: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          await callback(transaction),
      ),
    });

    const reel = await repository.updateReelStatus(
      'reel-1',
      'FAILED',
      undefined,
      undefined,
      undefined,
      undefined,
      'INDEXING_FAILED',
      'Indexing failed',
      100,
      undefined,
      undefined,
      undefined,
      undefined,
      'media-attempt-current',
      'INDEXING_FAILED',
      'Semantic backend unavailable',
    );

    expect(transaction.reel.updateMany).toHaveBeenCalledTimes(1);
    const [call] = transaction.reel.updateMany.mock.calls[0] as [
      UpdateManyCall,
    ];

    expect(call.where).toEqual({
      id: 'reel-1',
      mediaAttemptId: 'media-attempt-current',
    });
    expect(call.data).toMatchObject({
      status: 'COMPLETED',
      indexStatus: 'FAILED',
      processingStage: 'READY',
      processingMessage: 'Video is ready to watch',
      processingProgress: 100,
      processingErrorCode: 'INDEXING_FAILED',
      processingErrorDetail: 'Semantic backend unavailable',
    });
    expect(reel).toMatchObject({
      status: 'COMPLETED',
      mediaStatus: 'COMPLETED',
      indexStatus: 'FAILED',
    });
  });
});
