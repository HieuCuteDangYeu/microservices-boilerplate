import { IndexQualityAgentUseCase } from './index-quality-agent.use-case';

const document = {
  id: 'reel:1',
  reelId: 'reel-1',
  kind: 'REEL' as const,
  ordinal: 0,
  retrievalText: 'A grounded reel about PostgreSQL.',
  sourceSectionIds: [],
  sourceSegmentIds: [],
  sourceAudioArtifactIds: [],
  retrievalHash: 'hash',
  evidenceQuality: 'METADATA_ONLY' as const,
  sectioningVersion: 'v1',
  chunkingVersion: 'v1',
  summaryVersion: 'v1',
  indexVersion: 'v1',
  embeddingProvider: 'test',
  embeddingModel: 'test',
  embeddingDimensions: 2,
  embeddingVersion: 'v1',
  embeddingInputHash: 'hash',
  embedding: [0.1, 0.2],
  tokenCount: 8,
};

const job = {
  reelId: 'reel-1',
  indexAttemptId: 'attempt-1',
  indexVersion: 'v1',
  mediaAttemptId: 'media-1',
  mediaKey: 'reels/reel-1.mp4',
  sourceDurationMs: 60_000,
  sourceLengthClass: 'SHORT' as const,
  sourceOrientation: 'PORTRAIT' as const,
  title: 'PostgreSQL setup',
  description: 'A detailed PostgreSQL setup walkthrough for a NestJS service.',
  tags: ['postgresql', 'nestjs', 'backend'],
};

describe('IndexQualityAgentUseCase', () => {
  const inspector = {
    getSnapshot: jest.fn().mockResolvedValue({
      reelDocumentCount: 1,
      sectionCount: 0,
      chunkCount: 0,
      visualSceneCount: 0,
      transcriptSegmentCount: 0,
      activeDocumentCount: 0,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps semantic review advisory by default outside production', async () => {
    const ai = {
      reviewIndexQuality: jest.fn().mockResolvedValue({
        acceptable: false,
        confidence: 0.9,
        summary: 'Advisory issue.',
        issues: [
          {
            category: 'RETRIEVAL_QUALITY',
            severity: 'MEDIUM',
            message: 'Could be more specific.',
          },
        ],
      }),
    };
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const agent = new IndexQualityAgentUseCase(
      inspector as never,
      ai as never,
      config as never,
    );

    await expect(
      agent.execute({
        job: job as never,
        documents: [document],
        transcriptSegmentCount: 0,
      }),
    ).resolves.toBeUndefined();
    expect(ai.reviewIndexQuality).toHaveBeenCalledTimes(1);
  });

  it('is disabled by default in production until explicitly enabled', async () => {
    const ai = {
      reviewIndexQuality: jest.fn(),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'production' : undefined,
      ),
    };
    const agent = new IndexQualityAgentUseCase(
      inspector as never,
      ai as never,
      config as never,
    );

    await expect(
      agent.execute({
        job: job as never,
        documents: [document],
        transcriptSegmentCount: 0,
      }),
    ).resolves.toBeUndefined();
    expect(ai.reviewIndexQuality).not.toHaveBeenCalled();
  });

  it('blocks activation when semantic enforcement is enabled', async () => {
    const ai = {
      reviewIndexQuality: jest.fn().mockResolvedValue({
        acceptable: false,
        confidence: 0.95,
        summary: 'Grounding problem.',
        issues: [
          {
            category: 'GROUNDING',
            severity: 'HIGH',
            message: 'Retrieval content is not supported by the supplied evidence.',
          },
        ],
      }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'INDEX_QUALITY_AGENT_ENABLED' ||
        key === 'INDEX_QUALITY_AGENT_ENFORCE'
          ? 'true'
          : undefined,
      ),
    };
    const agent = new IndexQualityAgentUseCase(
      inspector as never,
      ai as never,
      config as never,
    );

    await expect(
      agent.execute({
        job: job as never,
        documents: [document],
        transcriptSegmentCount: 0,
      }),
    ).rejects.toThrow(
      'Semantic quality agent rejected inactive index candidate',
    );
  });
});
