/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import type { GenerateEmbeddingBatchResult } from '@common/ai/interfaces/generate-embedding.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type {
  CachedEmbedding,
  EmbeddingCacheIdentity,
} from '@common/processing/interfaces/reel-index-document.interface';
import { ConfigService } from '@nestjs/config';
import { BuildHierarchicalIndexUseCase } from './build-hierarchical-index.use-case';
import { BuildTranscriptSectionsUseCase } from './build-transcript-sections.use-case';

const job = (length: 'SHORT' | 'LONG' = 'SHORT'): ReelIndexJob => ({
  jobId: 'job-1',
  reelId: 'reel-1',
  userId: 'user-1',
  mediaAttemptId: 'media-1',
  indexAttemptId: 'index-1',
  indexVersion: 'reel-index-v2',
  mediaKey: 'reels/source.mp4',
  sourceDurationMs: length === 'LONG' ? 900_000 : 60_000,
  sourceOrientation: 'PORTRAIT',
  sourceLengthClass: length,
  tags: [],
  createdAt: '2026-07-22T00:00:00.000Z',
  schemaVersion: 1,
});

const segments = (count: number, secondsPerSegment = 10): TranscriptSegment[] =>
  Array.from({ length: count }, (_, index) => ({
    start: index * secondsPerSegment,
    end: (index + 1) * secondsPerSegment,
    text: Array.from({ length: 30 }, (__, word) =>
      word === 29 ? `word-${index}-${word}.` : `word-${index}-${word}`,
    ).join(' '),
  }));

function setup(config: Record<string, string> = {}) {
  const cache = new Map<string, CachedEmbedding>();
  const checkpoints = {
    findReusableEmbeddings: jest.fn((identities: EmbeddingCacheIdentity[]) =>
      Promise.resolve(
        identities
          .map((identity) => cache.get(identity.cacheKey))
          .filter((value): value is CachedEmbedding => Boolean(value)),
      ),
    ),
    saveEmbeddings: jest.fn((values: CachedEmbedding[]) => {
      values.forEach((value) => cache.set(value.cacheKey, value));
      return Promise.resolve();
    }),
  };
  const ai = {
    generateEmbeddingBatch: jest.fn(
      (input: {
        items: Array<{ id: string }>;
      }): Promise<GenerateEmbeddingBatchResult> =>
        Promise.resolve({
          embeddings: input.items.map((item, index) => ({
            id: item.id,
            values: [index + 1, 0],
            provider: 'google',
            model: 'gemini-embedding-001',
            dimensions: 2,
            version: '1',
          })),
          errors: [],
        }),
    ),
  };
  const useCase = new BuildHierarchicalIndexUseCase(
    new ConfigService({
      INDEX_CHUNK_TARGET_TOKENS: '60',
      INDEX_CHUNK_MAX_TOKENS: '80',
      INDEX_CHUNK_MIN_TOKENS: '20',
      INDEX_CHUNK_OVERLAP_TOKENS: '10',
      INDEX_CHUNK_MAX_SECONDS: '45',
      INDEX_EMBEDDING_BATCH_SIZE: '8',
      INDEX_EMBEDDING_DIMENSIONS: '2',
      ...config,
    }),
    ai as never,
    checkpoints as never,
  );
  return { useCase, ai, checkpoints, cache };
}

describe('Phase 5 deterministic hierarchical indexing', () => {
  it('builds short Reel and chunk documents with token, time, and overlap bounds', async () => {
    const { useCase, ai } = setup();
    const transcriptSegments = segments(8, 10);
    const sectionUseCase = new BuildTranscriptSectionsUseCase(
      new ConfigService(),
    );
    const sections = sectionUseCase.execute(undefined, transcriptSegments);
    const result = await useCase.execute({
      job: job('SHORT'),
      metadata: {
        title: 'Short Reel',
        description: 'Summary',
        tags: ['topic'],
      },
      sections,
      transcriptSegments,
    });

    expect(
      result.documents.filter((document) => document.kind === 'REEL'),
    ).toHaveLength(1);
    expect(
      result.documents.filter((document) => document.kind === 'SECTION'),
    ).toHaveLength(0);
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(
      result.chunks.every((chunk) => chunk.text.split(/\s+/).length <= 80),
    ).toBe(true);
    expect(
      result.chunks.every(
        (chunk) =>
          chunk.startTime === undefined ||
          chunk.endTime === undefined ||
          chunk.endTime - chunk.startTime <= 45,
      ),
    ).toBe(true);
    expect(
      result.chunks.length === 1 ||
        result.chunks.every((chunk) => chunk.text.split(/\s+/).length >= 20),
    ).toBe(true);
    const firstWords = result.chunks[0].text.split(/\s+/);
    const secondWords = result.chunks[1].text.split(/\s+/);
    expect(secondWords.slice(0, 10)).toEqual(firstWords.slice(-10));
    const [batchCall] = ai.generateEmbeddingBatch.mock.calls[0] as [
      { items: Array<{ id: string }> },
    ];
    expect(batchCall.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['reel:reel-1', 'reel:reel-1:chunk:0']),
    );
  });

  it('builds Reel, section, and chunk levels for long videos', async () => {
    const { useCase } = setup();
    const transcriptSegments = segments(60, 15);
    const sections = new BuildTranscriptSectionsUseCase(
      new ConfigService({
        INDEX_SECTION_TARGET_SECONDS: '300',
        INDEX_SECTION_MAX_SECONDS: '480',
      }),
    ).execute(undefined, transcriptSegments);
    const result = await useCase.execute({
      job: job('LONG'),
      metadata: {
        title: 'Long video',
        description: 'Final transcript summary',
        tags: ['main-topic'],
      },
      sections: sections.map((section) => ({
        ...section,
        summary: `Summary ${section.index}`,
      })),
      transcriptSegments,
    });

    expect(new Set(result.documents.map((document) => document.kind))).toEqual(
      new Set(['REEL', 'SECTION', 'CHUNK']),
    );
    expect(
      result.documents
        .filter((document) => document.kind === 'SECTION')
        .every((document) =>
          document.startTime === undefined || document.endTime === undefined
            ? false
            : document.endTime - document.startTime <= 480,
        ),
    ).toBe(true);
    expect(
      result.documents
        .filter((document) => document.kind === 'SECTION')
        .every((document) =>
          document.startTime === undefined || document.endTime === undefined
            ? false
            : document.endTime - document.startTime >= 180,
        ),
    ).toBe(true);
  });

  it('keeps stable IDs and hashes for identical input', () => {
    const { useCase } = setup();
    const input = {
      job: job(),
      metadata: {
        title: 'Stable',
        description: 'Stable summary',
        tags: ['one'],
      },
      sections: [],
      transcriptSegments: segments(2),
    };
    const first = useCase.buildDocumentDrafts(input);
    const second = useCase.buildDocumentDrafts(input);
    expect(second.map((draft) => draft.id)).toEqual(
      first.map((draft) => draft.id),
    );
    expect(second.map((draft) => draft.embeddingInputHash)).toEqual(
      first.map((draft) => draft.embeddingInputHash),
    );
  });

  it('reuses cached embeddings without another AI request', async () => {
    const { useCase, ai } = setup();
    const input = {
      job: job(),
      metadata: { title: 'Cached', description: 'Cached summary', tags: [] },
      sections: [],
      transcriptSegments: segments(2),
    };
    await useCase.execute(input);
    await useCase.execute(input);
    expect(ai.generateEmbeddingBatch).toHaveBeenCalledTimes(1);
  });

  it('persists successful batch items and retries only missing documents', async () => {
    const { useCase, ai, cache } = setup({ INDEX_EMBEDDING_BATCH_SIZE: '2' });
    ai.generateEmbeddingBatch.mockImplementationOnce((input) =>
      Promise.resolve({
        embeddings: [
          {
            id: input.items[0].id,
            values: [1, 0],
            provider: 'google',
            model: 'gemini-embedding-001',
            dimensions: 2,
            version: '1',
          },
        ],
        errors: [{ id: input.items[1].id, error: 'provider unavailable' }],
      }),
    );
    const input = {
      job: job(),
      metadata: { title: 'Retry', description: 'Retry summary', tags: [] },
      sections: [],
      transcriptSegments: segments(4),
    };

    await expect(useCase.execute(input)).rejects.toThrow(
      'Batch embedding failed for 1 items',
    );
    expect(cache.size).toBe(1);
    const completedStableId = useCase.buildDocumentDrafts(input)[0].id;

    await expect(useCase.execute(input)).resolves.toBeDefined();
    const retryRequest = ai.generateEmbeddingBatch.mock.calls[1][0];
    expect(retryRequest.items.map((item) => item.id)).not.toContain(
      completedStableId,
    );
  });

  it('changes the cache identity when versioned input changes', () => {
    const first = setup({ INDEX_CHUNKING_VERSION: 'chunk-v1' }).useCase;
    const second = setup({ INDEX_CHUNKING_VERSION: 'chunk-v2' }).useCase;
    const input = {
      job: job(),
      metadata: { title: 'Versioned', description: 'Summary', tags: [] },
      sections: [],
      transcriptSegments: segments(1),
    };
    expect(first.buildDocumentDrafts(input)[0].cacheKey).not.toBe(
      second.buildDocumentDrafts(input)[0].cacheKey,
    );
  });

  it('bounds Reel embedding input instead of concatenating a full transcript', () => {
    const { useCase } = setup({ INDEX_CHUNK_MAX_TOKENS: '350' });
    const drafts = useCase.buildDocumentDrafts({
      job: job(),
      metadata: { tags: [] },
      sections: [],
      transcript: Array.from(
        { length: 10_000 },
        (_, index) => `word-${index}`,
      ).join(' '),
    });
    expect(drafts[0].text.split(/\s+/)).toHaveLength(350);
  });
});
