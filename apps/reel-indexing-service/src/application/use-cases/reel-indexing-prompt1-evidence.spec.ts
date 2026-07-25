/**
 * TEMPORARY REEL INDEXING/RETRIEVAL MIGRATION TEST
 * Remove only after production validation.
 */

import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type {
  CachedEmbedding,
  EmbeddingCacheIdentity,
} from '@common/processing/interfaces/reel-index-document.interface';
import { ConfigService } from '@nestjs/config';
import { BuildAdaptiveTranscriptSectionsUseCase } from './build-adaptive-transcript-sections.use-case';
import { BuildHierarchicalIndexUseCase } from './build-hierarchical-index.use-case';
import { BuildLongEvidenceChunksUseCase } from './build-long-evidence-chunks.use-case';
import { BuildShortEvidenceChunksUseCase } from './build-short-evidence-chunks.use-case';
import { BuildTranscriptSectionsUseCase } from './build-transcript-sections.use-case';
import { ValidateEvidenceIndexCandidateUseCase } from './validate-evidence-index-candidate.use-case';
import { routeIndexing } from '../../infrastructure/workflows/reel-index-langgraph.workflow';

const job = (length: 'SHORT' | 'LONG' = 'SHORT'): ReelIndexJob => ({
  jobId: 'job-1',
  reelId: 'reel-1',
  userId: 'user-1',
  mediaAttemptId: 'media-1',
  indexAttemptId: 'index-1',
  indexVersion: 'index-v3',
  mediaKey: 'source.mp4',
  sourceDurationMs: length === 'LONG' ? 600_000 : 60_000,
  sourceHasAudio: true,
  sourceOrientation: 'PORTRAIT',
  sourceLengthClass: length,
  tags: ['trusted'],
  createdAt: '2026-07-25T00:00:00.000Z',
  schemaVersion: 1,
});

const transcriptSegments = (count: number): TranscriptSegment[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index,
    start: index * 10,
    end: (index + 1) * 10,
    text: `exact evidence segment ${index}.`,
    sourceSegmentId: `segment-${index}`,
    sourceAudioArtifactId: `audio-${Math.floor(index / 2)}`,
  }));

function setup(overrides: Record<string, string> = {}) {
  const config = new ConfigService({
    INDEX_SHORT_CHUNK_TARGET_TOKENS: '8',
    INDEX_SHORT_CHUNK_MIN_TOKENS: '2',
    INDEX_SHORT_CHUNK_MAX_TOKENS: '12',
    INDEX_SHORT_CHUNK_OVERLAP_TOKENS: '2',
    INDEX_SHORT_CHUNK_MAX_SECONDS: '45',
    INDEX_LONG_CHUNK_TARGET_TOKENS: '8',
    INDEX_LONG_CHUNK_MIN_TOKENS: '2',
    INDEX_LONG_CHUNK_MAX_TOKENS: '12',
    INDEX_LONG_CHUNK_OVERLAP_TOKENS: '2',
    INDEX_LONG_CHUNK_MAX_SECONDS: '45',
    INDEX_DOCUMENT_MAX_TOKENS: '30',
    INDEX_EMBEDDING_DIMENSIONS: '2',
    ...overrides,
  });
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
    countDocumentTokens: jest.fn(
      (input: { items: Array<{ id: string; text: string }> }) =>
        Promise.resolve({
          items: input.items.map((item) => ({
            id: item.id,
            tokenCount: item.text.split(/\s+/).length,
          })),
        }),
    ),
    generateEmbeddingBatch: jest.fn((input: { items: Array<{ id: string }> }) =>
      Promise.resolve({
        embeddings: input.items.map((item) => ({
          id: item.id,
          values: [1, 0],
          provider: 'google',
          model: 'gemini-embedding-001',
          dimensions: 2,
          version: '1',
        })),
        errors: [],
      }),
    ),
  };
  const shortChunks = new BuildShortEvidenceChunksUseCase(config);
  const longChunks = new BuildLongEvidenceChunksUseCase(shortChunks);
  const useCase = new BuildHierarchicalIndexUseCase(
    config,
    shortChunks,
    longChunks,
    ai as never,
    checkpoints as never,
  );
  return { config, useCase, ai, checkpoints };
}

describe('Prompt 1 deterministic routing', () => {
  it('routes verified no-audio media without transcription', () => {
    expect(
      routeIndexing({
        hasAudio: false,
        durationMs: 60_000,
        sourceLengthClass: 'SHORT',
        shortMaximumSeconds: 180,
      }),
    ).toBe('NO_AUDIO');
  });

  it('uses deterministic SHORT and LONG duration routes', () => {
    expect(
      routeIndexing({
        hasAudio: true,
        durationMs: 60_000,
        sourceLengthClass: 'SHORT',
        shortMaximumSeconds: 180,
      }),
    ).toBe('SHORT');
    expect(
      routeIndexing({
        hasAudio: true,
        durationMs: 600_000,
        sourceLengthClass: 'LONG',
        shortMaximumSeconds: 180,
      }),
    ).toBe('LONG');
  });

  it('rejects a provided duration classification mismatch', () => {
    expect(() =>
      routeIndexing({
        hasAudio: true,
        durationMs: 600_000,
        sourceLengthClass: 'SHORT',
        shortMaximumSeconds: 180,
      }),
    ).toThrow('Index classification mismatch');
  });
});

describe('Prompt 1 evidence-preserving documents', () => {
  it('keeps exact evidence separate from generated summaries and lineage', () => {
    const { useCase } = setup();
    const drafts = useCase.buildDocumentDrafts({
      job: job(),
      metadata: {
        title: 'Trusted title',
        description: 'Generated summary must stay separate',
        tags: ['trusted'],
      },
      sections: [],
      transcriptSegments: transcriptSegments(4),
    });
    const chunk = drafts.find((draft) => draft.kind === 'CHUNK')!;
    expect(chunk.evidenceText).toContain('exact evidence');
    expect(chunk.evidenceText).not.toContain('Generated summary');
    expect(chunk.sourceSegmentIds.length).toBeGreaterThan(0);
    expect(chunk.sourceAudioArtifactIds.length).toBeGreaterThan(0);
    expect(drafts[0].derivedSummary).toBe(
      'Generated summary must stay separate',
    );
  });

  it('preserves untimed transcript text as low-confidence evidence', () => {
    const { useCase } = setup();
    const drafts = useCase.buildDocumentDrafts({
      job: job(),
      metadata: { title: 'Untimed transcript', tags: [] },
      sections: [],
      transcript: 'verified provider text without timestamp segments',
    });
    const chunk = drafts.find((draft) => draft.kind === 'CHUNK')!;
    expect(chunk.evidenceText).toContain('verified provider text');
    expect(chunk.evidenceQuality).toBe('LOW_CONFIDENCE');
    expect(chunk.sourceSegmentIds[0]).toMatch(/^transcript:/);
  });

  it('builds long chunks inside their parent sections', () => {
    const { useCase } = setup();
    const segments = transcriptSegments(6);
    const sections = [
      {
        index: 0,
        startMs: 0,
        endMs: 30_000,
        text: segments
          .slice(0, 3)
          .map((item) => item.text)
          .join(' '),
      },
      {
        index: 1,
        startMs: 30_000,
        endMs: 60_000,
        text: segments
          .slice(3)
          .map((item) => item.text)
          .join(' '),
      },
    ];
    const drafts = useCase.buildDocumentDrafts({
      job: { ...job('LONG'), sourceDurationMs: 60_000 },
      metadata: { title: 'Long evidence', tags: [] },
      sections,
      transcriptSegments: segments,
    });
    expect(new Set(drafts.map((draft) => draft.kind))).toEqual(
      new Set(['REEL', 'SECTION', 'CHUNK']),
    );
    expect(
      drafts
        .filter((draft) => draft.kind === 'CHUNK')
        .every((draft) => draft.parentId?.includes(':section:')),
    ).toBe(true);
  });

  it('validates actual model tokens, shrinks deterministically, and recounts', async () => {
    const { useCase, ai } = setup({ INDEX_DOCUMENT_MAX_TOKENS: '20' });
    ai.countDocumentTokens
      .mockResolvedValueOnce({
        items: [
          { id: 'reel:reel-1', tokenCount: 40 },
          { id: 'reel:reel-1:chunk:0', tokenCount: 40 },
        ],
      })
      .mockImplementation(
        (input: { items: Array<{ id: string; text: string }> }) =>
          Promise.resolve({
            items: input.items.map((item) => ({
              id: item.id,
              tokenCount: Math.min(20, item.text.split(/\s+/).length),
            })),
          }),
      );
    const drafts = useCase.buildDocumentDrafts({
      job: { ...job(), sourceHasAudio: false },
      metadata: {
        title: 'A metadata only title with enough words to be counted',
        description:
          'A long metadata description that forces deterministic retrieval text shrinking before embeddings.',
        tags: ['one', 'two'],
      },
      sections: [],
    });
    const counted = await useCase.validateDocumentTokens(drafts);
    expect(ai.countDocumentTokens).toHaveBeenCalledTimes(2);
    expect(counted.every((draft) => (draft.tokenCount ?? 0) <= 20)).toBe(true);
  });

  it('reuses embedding cache entries on node replay', async () => {
    const { useCase, ai } = setup();
    const drafts = await useCase.validateDocumentTokens(
      useCase.buildDocumentDrafts({
        job: job(),
        metadata: { title: 'Cache replay', tags: [] },
        sections: [],
        transcriptSegments: transcriptSegments(2),
      }),
    );
    await useCase.generateMissingEmbeddings(drafts);
    await useCase.generateMissingEmbeddings(drafts);
    expect(ai.generateEmbeddingBatch).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid vectors before semantic candidate activation', async () => {
    const { config, useCase } = setup();
    const drafts = await useCase.validateDocumentTokens(
      useCase.buildDocumentDrafts({
        job: job(),
        metadata: { title: 'Invalid vector', tags: [] },
        sections: [],
        transcriptSegments: transcriptSegments(2),
      }),
    );
    const documents = drafts.map((draft) => ({
      ...draft,
      tokenCount: draft.tokenCount ?? 1,
      embedding: [Number.NaN, 0],
    }));
    expect(() =>
      new ValidateEvidenceIndexCandidateUseCase(config).execute({
        job: job(),
        documents,
        transcriptSegments: transcriptSegments(2),
      }),
    ).toThrow('invalid embedding');
  });
});

describe('Prompt 1 adaptive sections', () => {
  it('uses candidate-window embeddings and splits at a strong boundary', async () => {
    const config = new ConfigService({
      INDEX_LONG_ADAPTIVE_SECTIONING_ENABLED: 'true',
      INDEX_LONG_ADAPTIVE_SECTIONING_SHADOW_MODE: 'false',
      INDEX_LONG_SECTION_MIN_SECONDS: '10',
      INDEX_LONG_SECTION_TARGET_SECONDS: '20',
      INDEX_LONG_SECTION_MAX_SECONDS: '30',
      INDEX_LONG_SECTION_CANDIDATE_PAUSE_MS: '1000',
      INDEX_SECTION_BOUNDARY_THRESHOLD: '0.2',
    });
    const ai = {
      generateEmbeddingBatch: jest.fn(
        (input: { items: Array<{ id: string }> }) =>
          Promise.resolve({
            embeddings: input.items.map((item) => ({
              id: item.id,
              values: item.id.endsWith(':left') ? [1, 0] : [0, 1],
              dimensions: 2,
              model: 'test',
              provider: 'test',
              version: '1',
            })),
            errors: [],
          }),
      ),
    };
    const useCase = new BuildAdaptiveTranscriptSectionsUseCase(
      config,
      new BuildTranscriptSectionsUseCase(config),
      ai as never,
    );
    const segments = transcriptSegments(5).map((segment, index) => ({
      ...segment,
      start: index * 15,
      end: index * 15 + 10,
    }));
    const sections = await useCase.execute(segments);
    expect(sections.length).toBeGreaterThan(1);
    expect(ai.generateEmbeddingBatch).toHaveBeenCalledTimes(1);
  });
});
