/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import type { ReelIndexDocument } from '@common/processing/interfaces/reel-index-document.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import { SEMANTIC_INDEX_EMBEDDING_DIMENSIONS } from '@common/processing/interfaces/semantic-index.interface';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/reel-indexing-client';
import { PrismaSemanticIndexRepository } from './prisma-semantic-index.repository';

const embedding = Array.from(
  { length: SEMANTIC_INDEX_EMBEDDING_DIMENSIONS },
  (_, index) => index / SEMANTIC_INDEX_EMBEDDING_DIMENSIONS,
);

const job: ReelIndexJob = {
  jobId: 'job-6',
  reelId: 'reel-6',
  userId: 'user-6',
  mediaAttemptId: 'media-6',
  indexAttemptId: 'attempt-6',
  indexVersion: 'reel-index-v2',
  mediaKey: 'reels/source.mp4',
  sourceDurationMs: 900_000,
  sourceOrientation: 'LANDSCAPE',
  sourceLengthClass: 'LONG',
  tags: ['source-tag'],
  createdAt: '2026-07-22T00:00:00.000Z',
  schemaVersion: 1,
};

const document = (
  kind: ReelIndexDocument['kind'],
  ordinal: number,
): ReelIndexDocument => ({
  id:
    kind === 'REEL'
      ? `reel:${job.reelId}`
      : `reel:${job.reelId}:${kind.toLowerCase()}:${ordinal}`,
  reelId: job.reelId,
  kind,
  ordinal,
  parentId: kind === 'REEL' ? undefined : `reel:${job.reelId}`,
  text: `${kind} semantic text`,
  startTime: kind === 'REEL' ? undefined : ordinal * 30,
  endTime: kind === 'REEL' ? undefined : (ordinal + 1) * 30,
  embedding,
  embeddingProvider: 'google',
  embeddingModel: 'gemini-embedding-001',
  embeddingDimensions: SEMANTIC_INDEX_EMBEDDING_DIMENSIONS,
  embeddingVersion: '1',
  embeddingInputHash: `hash-${kind}-${ordinal}`,
  indexVersion: job.indexVersion,
  chunkingVersion: 'reel-chunk-v2',
  summaryVersion: 'reel-summary-v1',
});

function setup() {
  const calls: string[] = [];
  let searchQuery: Prisma.Sql | undefined;
  const transaction = {
    $executeRaw: jest.fn().mockImplementation(() => {
      calls.push('sql');
      return Promise.resolve(1);
    }),
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockImplementation((query: Prisma.Sql) => {
      searchQuery = query;
      return Promise.resolve([
        {
          id: 'reel:reel-6',
          reelId: 'reel-6',
          parentId: null,
          userId: 'user-6',
          text: 'semantic text',
          tags: ['semantic'],
          startTime: null,
          endTime: null,
          sourceDurationMs: 900_000,
          sourceOrientation: 'LANDSCAPE',
          sourceLengthClass: 'LONG',
          rrfScore: 0.04,
          vectorDistance: 0.1,
          vectorRank: 1n,
          keywordRank: 2n,
          metadataRank: 3n,
        },
      ]);
    }),
    reelDocument: modelMock('document', calls),
    reelSection: modelMock('section', calls),
    reelChunk: modelMock('chunk', calls),
    transcriptionSegment: {
      ...modelMock('transcript', calls),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    indexingAttempt: modelMock('attempt', calls),
  };
  const prisma = {
    $transaction: jest.fn().mockImplementation((input: unknown) => {
      if (typeof input === 'function') {
        return (input as (tx: typeof transaction) => unknown)(transaction);
      }
      return Promise.all(input as Promise<unknown>[]);
    }),
    ...transaction,
    embeddingCacheEntry: modelMock('cache', calls),
    indexingAttempt: modelMock('attempt', calls),
  };
  const repository = new PrismaSemanticIndexRepository(
    prisma as never,
    new ConfigService(),
  );
  return {
    repository,
    prisma,
    transaction,
    calls,
    getSearchQuery: () => searchQuery,
  };
}

function modelMock(name: string, calls: string[]) {
  return {
    deleteMany: jest.fn().mockImplementation(() => {
      calls.push(`delete:${name}`);
      return Promise.resolve({ count: 1 });
    }),
    updateMany: jest.fn().mockImplementation(() => {
      calls.push(`update:${name}`);
      return Promise.resolve({ count: 1 });
    }),
  };
}

describe('Phase 6 semantic persistence and RRF retrieval', () => {
  it('stages Reel, section, chunk, and transcription rows as one transaction', async () => {
    const { repository, prisma, transaction } = setup();
    await repository.persistCandidate({
      job,
      metadata: {
        title: 'Semantic title',
        description: 'Semantic description',
        tags: ['semantic'],
      },
      transcriptSegments: [{ start: 0, end: 3, text: 'precise evidence' }],
      documents: [
        document('REEL', 0),
        document('SECTION', 0),
        document('CHUNK', 0),
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(4);
    expect(transaction.transcriptionSegment.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ reelId: job.reelId, ordinal: 0 })],
    });
  });

  it('deactivates the prior generation before activating and pruning it', async () => {
    const { repository, calls } = setup();
    await repository.activateCandidate(job.reelId, job.indexAttemptId);

    expect(calls.slice(1, 4)).toEqual([
      'update:chunk',
      'update:section',
      'update:document',
    ]);
    expect(calls.filter((call) => call === 'update:document')).toHaveLength(2);
    expect(calls.slice(-5)).toEqual([
      'delete:chunk',
      'delete:section',
      'delete:document',
      'delete:transcript',
      'update:attempt',
    ]);
  });

  it('fuses ordinal vector, keyword, and metadata ranks instead of raw scores', async () => {
    const { repository, getSearchQuery } = setup();
    const rows = await repository.searchReels({
      queryText: 'semantic text',
      queryTags: ['semantic'],
      queryEmbedding: embedding,
    });

    const sql = String(getSearchQuery()?.sql ?? '');
    expect(sql).toContain('vector_candidates');
    expect(sql).toContain('keyword_candidates');
    expect(sql).toContain('metadata_candidates');
    expect(sql).toContain('1.0 / (60 + v.rank)');
    expect(rows[0]).toEqual(
      expect.objectContaining({
        rrfScore: 0.04,
        vectorRank: 1,
        keywordRank: 2,
        metadataRank: 3,
      }),
    );
  });

  it('rejects invalid query and document vector dimensions before SQL', async () => {
    const { repository, prisma } = setup();
    await expect(
      repository.searchChunks({ queryEmbedding: [1, 2] }),
    ).rejects.toThrow('384 finite values');
    await expect(
      repository.persistCandidate({
        job,
        metadata: { tags: [] },
        documents: [{ ...document('REEL', 0), embedding: [1, 2] }],
      }),
    ).rejects.toThrow('384-dimension embedding');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires at least one independent retrieval signal', async () => {
    const { repository } = setup();
    await expect(repository.searchSections({})).rejects.toThrow(
      'requires text, an embedding, or tags',
    );
  });
});
