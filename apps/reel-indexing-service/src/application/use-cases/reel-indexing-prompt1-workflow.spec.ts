/**
 * TEMPORARY REEL INDEXING/RETRIEVAL MIGRATION TEST
 * Remove only after production validation.
 */

import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { IndexJobCheckpoint } from '@indexing/domain/entities/index-checkpoint.entity';
import { ReelIndexLangGraphWorkflow } from '@indexing/infrastructure/workflows/reel-index-langgraph.workflow';
import { MemorySaver } from '@langchain/langgraph';
import { ConfigService } from '@nestjs/config';
import { ProcessReelIndexJobUseCase } from './process-reel-index-job.use-case';

const job: ReelIndexJob = {
  jobId: 'workflow-job',
  reelId: 'workflow-reel',
  userId: 'workflow-user',
  mediaAttemptId: 'workflow-media',
  indexAttemptId: 'workflow-index',
  indexVersion: 'index-v3',
  mediaKey: 'source.mp4',
  transcriptionAudioManifestKey: 'manifest.json',
  sourceDurationMs: 60_000,
  sourceHasAudio: false,
  sourceOrientation: 'PORTRAIT',
  sourceLengthClass: 'SHORT',
  title: 'Strong metadata title',
  description:
    'A sufficiently complete user-authored description for metadata indexing.',
  tags: ['one', 'two', 'three'],
  createdAt: '2026-07-25T00:00:00.000Z',
  schemaVersion: 1,
};

function setup(contentApplied = true) {
  let checkpoint: IndexJobCheckpoint | null = null;
  const document = {
    id: `reel:${job.reelId}`,
    reelId: job.reelId,
    kind: 'REEL' as const,
    ordinal: 0,
    retrievalText: 'Document type: Reel',
    sourceSectionIds: [],
    sourceSegmentIds: [],
    sourceAudioArtifactIds: [],
    retrievalHash: 'hash',
    evidenceQuality: 'METADATA_ONLY' as const,
    sectioningVersion: 'section-v1',
    chunkingVersion: 'chunk-v1',
    summaryVersion: 'summary-v1',
    indexVersion: job.indexVersion,
    embeddingProvider: 'test',
    embeddingModel: 'test',
    embeddingDimensions: 2,
    embeddingVersion: '1',
    embeddingInputHash: 'hash',
    embedding: [1, 0],
    tokenCount: 4,
  };
  const draft = {
    ...document,
    stableItemId: document.id,
    documentKind: document.kind,
    cacheKey: 'cache',
  };
  const checkpoints = {
    get: jest.fn(() => Promise.resolve(checkpoint)),
    startOrResume: jest.fn(() => {
      checkpoint ??= {
        indexAttemptId: job.indexAttemptId,
        jobId: job.jobId,
        reelId: job.reelId,
        mediaAttemptId: job.mediaAttemptId,
        indexVersion: job.indexVersion,
        status: 'PROCESSING',
        stage: 'TRANSCRIBING_AUDIO_SEGMENTS',
      };
      return Promise.resolve(checkpoint);
    }),
    setStage: jest.fn(
      (
        _: string,
        stage: IndexJobCheckpoint['stage'],
        data?: Partial<IndexJobCheckpoint>,
      ) => {
        checkpoint = { ...checkpoint!, ...data, stage };
        return Promise.resolve();
      },
    ),
    fail: jest.fn(),
  };
  const content = {
    claimIndexingAttempt: jest.fn().mockResolvedValue(true),
    reportProgress: jest.fn().mockResolvedValue(undefined),
    completeIndexing: jest.fn().mockResolvedValue(contentApplied),
    failIndexing: jest.fn().mockResolvedValue(undefined),
  };
  const semantic = {
    persistCandidate: jest.fn().mockResolvedValue(undefined),
    discardCandidate: jest.fn().mockResolvedValue(undefined),
    activateCandidate: jest.fn().mockImplementation(() => {
      checkpoint = { ...checkpoint!, status: 'COMPLETED' };
      return Promise.resolve();
    }),
  };
  const buildIndex = {
    buildDocumentDrafts: jest.fn().mockReturnValue([draft]),
    validateDocumentTokens: jest.fn().mockResolvedValue([draft]),
    generateMissingEmbeddings: jest.fn().mockResolvedValue(undefined),
    materializeDocuments: jest.fn().mockResolvedValue([document]),
    toLegacyChunks: jest.fn().mockReturnValue([
      {
        chunkIndex: 0,
        text: document.retrievalText,
        embedding: document.embedding,
        embeddingModel: 'test',
      },
    ]),
  };
  const validate = { execute: jest.fn() };
  const workflow = new ReelIndexLangGraphWorkflow(
    new ConfigService(),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    buildIndex as never,
    validate as never,
    new MemorySaver() as never,
    { getTranscriptionAudioManifest: jest.fn() },
    checkpoints as never,
    content as never,
    semantic as never,
  );
  return {
    workflow,
    checkpoints,
    content,
    semantic,
    buildIndex,
    validate,
  };
}

describe('Prompt 1 durable indexing workflow', () => {
  it('persists, compatibility-writes, activates, and resumes completed work', async () => {
    const { workflow, content, semantic, validate } = setup(true);
    await expect(workflow.execute({ job, allowReclaim: false })).resolves.toBe(
      'COMPLETED',
    );
    expect(validate.execute).toHaveBeenCalledTimes(1);
    expect(semantic.persistCandidate).toHaveBeenCalledTimes(1);
    expect(content.completeIndexing).toHaveBeenCalledWith(
      expect.objectContaining({
        reelId: job.reelId,
        chunks: expect.any(Array),
      }),
    );
    expect(semantic.activateCandidate).toHaveBeenCalledWith(
      job.reelId,
      job.indexAttemptId,
    );

    await expect(workflow.execute({ job, allowReclaim: true })).resolves.toBe(
      'DUPLICATE',
    );
    expect(semantic.persistCandidate).toHaveBeenCalledTimes(1);
  });

  it('discards an inactive semantic candidate when Content reports stale state', async () => {
    const { workflow, semantic } = setup(false);
    await expect(workflow.execute({ job, allowReclaim: false })).resolves.toBe(
      'STALE',
    );
    expect(semantic.discardCandidate).toHaveBeenCalledWith(
      job.reelId,
      job.indexAttemptId,
    );
    expect(semantic.activateCandidate).not.toHaveBeenCalled();
  });

  it('reports indexing failure without changing media completion ownership', async () => {
    const checkpoints = {
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const content = {
      failIndexing: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new ProcessReelIndexJobUseCase(
      {
        execute: jest.fn().mockRejectedValue(new Error('index failed')),
      } as never,
      checkpoints as never,
      content as never,
    );
    await expect(
      useCase.execute({ job, allowReclaim: false, allowRetry: false }),
    ).resolves.toEqual({
      status: 'PERMANENT_FAILURE',
      error: 'index failed',
    });
    expect(content.failIndexing).toHaveBeenCalledWith({
      reelId: job.reelId,
      indexAttemptId: job.indexAttemptId,
      errorDetail: 'index failed',
    });
  });
});
