/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import { ProcessReelIndexJobUseCase } from './process-reel-index-job.use-case';

const job: ReelIndexJob = {
  jobId: 'phase6-job',
  reelId: 'phase6-reel',
  userId: 'phase6-user',
  mediaAttemptId: 'phase6-media',
  indexAttemptId: 'phase6-attempt',
  indexVersion: 'reel-index-v2',
  mediaKey: 'source.mp4',
  sourceDurationMs: 60_000,
  sourceOrientation: 'PORTRAIT',
  sourceLengthClass: 'SHORT',
  tags: [],
  createdAt: '2026-07-22T00:00:00.000Z',
  schemaVersion: 1,
};

function setup(contentApplied: boolean) {
  const checkpoint = {
    indexAttemptId: job.indexAttemptId,
    jobId: job.jobId,
    reelId: job.reelId,
    mediaAttemptId: job.mediaAttemptId,
    indexVersion: job.indexVersion,
    status: 'FAILED' as const,
    stage: 'PERSISTING' as const,
    mergedTranscript: 'semantic evidence',
    mergedSegments: [{ start: 0, end: 2, text: 'semantic evidence' }],
    extractedMetadata: {
      title: 'Semantic Reel',
      description: 'Recovery test',
      tags: ['semantic'],
    },
    sections: [],
  };
  const checkpoints = {
    get: jest.fn().mockResolvedValue(checkpoint),
    startOrResume: jest.fn().mockResolvedValue(checkpoint),
    setStage: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const content = {
    claimIndexingAttempt: jest.fn().mockResolvedValue(true),
    reportProgress: jest.fn().mockResolvedValue(undefined),
    completeIndexing: jest.fn().mockResolvedValue(contentApplied),
    failIndexing: jest.fn().mockResolvedValue(undefined),
  };
  const semanticIndex = {
    persistCandidate: jest.fn().mockResolvedValue(undefined),
    activateCandidate: jest.fn().mockResolvedValue(undefined),
    discardCandidate: jest.fn().mockResolvedValue(undefined),
  };
  const hierarchical = {
    execute: jest.fn().mockResolvedValue({
      chunks: [
        {
          chunkIndex: 0,
          text: 'semantic evidence',
          embedding: [1],
          embeddingModel: 'test',
        },
      ],
      documents: [
        {
          id: 'reel:phase6-reel',
          reelId: job.reelId,
          kind: 'REEL',
          ordinal: 0,
          text: 'semantic evidence',
          embedding: [1],
        },
      ],
    }),
  };
  const useCase = new ProcessReelIndexJobUseCase(
    { execute: jest.fn().mockResolvedValue({ segments: [] }) } as never,
    {} as never,
    {} as never,
    {} as never,
    hierarchical as never,
    checkpoints as never,
    content as never,
    semanticIndex as never,
  );
  return { useCase, checkpoints, content, semanticIndex };
}

describe('Phase 6 semantic activation recovery', () => {
  it('resumes a PERSISTING attempt without trying to reclaim Content state', async () => {
    const { useCase, content, semanticIndex } = setup(true);

    await expect(
      useCase.execute({ job, allowReclaim: true, allowRetry: true }),
    ).resolves.toEqual({ status: 'COMPLETED' });
    expect(content.claimIndexingAttempt).not.toHaveBeenCalled();
    expect(semanticIndex.persistCandidate).toHaveBeenCalledTimes(1);
    expect(semanticIndex.activateCandidate).toHaveBeenCalledWith(
      job.reelId,
      job.indexAttemptId,
    );
  });

  it('discards an inactive semantic candidate when Content rejects it as stale', async () => {
    const { useCase, semanticIndex } = setup(false);

    await expect(
      useCase.execute({ job, allowReclaim: true, allowRetry: true }),
    ).resolves.toEqual({ status: 'STALE' });
    expect(semanticIndex.activateCandidate).not.toHaveBeenCalled();
    expect(semanticIndex.discardCandidate).toHaveBeenCalledWith(
      job.reelId,
      job.indexAttemptId,
    );
  });
});
