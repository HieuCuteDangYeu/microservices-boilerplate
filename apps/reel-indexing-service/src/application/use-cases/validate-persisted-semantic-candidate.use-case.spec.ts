import { ValidatePersistedSemanticCandidateUseCase } from './validate-persisted-semantic-candidate.use-case';

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

const input = {
  job: job as never,
  documents: [document],
  transcriptSegmentCount: 0,
};

const advisoryPolicy = {
  enabled: true,
  enforced: false,
  required: false,
  maxDocuments: 36,
};

describe('ValidatePersistedSemanticCandidateUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs deterministic validation before advisory semantic review', async () => {
    const callOrder: string[] = [];
    const validator = {
      execute: jest.fn().mockImplementation(async () => {
        callOrder.push('validator');
      }),
    };
    const ai = {
      reviewIndexQuality: jest.fn().mockImplementation(async () => {
        callOrder.push('reviewer');
        return {
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
        };
      }),
    };
    const useCase = new ValidatePersistedSemanticCandidateUseCase(
      validator as never,
      ai as never,
      advisoryPolicy,
    );

    await expect(useCase.execute(input)).resolves.toBeUndefined();
    expect(callOrder).toEqual(['validator', 'reviewer']);
  });

  it('never runs semantic review when deterministic validation fails', async () => {
    const validator = {
      execute: jest.fn().mockRejectedValue(new Error('integrity mismatch')),
    };
    const ai = { reviewIndexQuality: jest.fn() };
    const useCase = new ValidatePersistedSemanticCandidateUseCase(
      validator as never,
      ai as never,
      advisoryPolicy,
    );

    await expect(useCase.execute(input)).rejects.toThrow('integrity mismatch');
    expect(ai.reviewIndexQuality).not.toHaveBeenCalled();
  });

  it('blocks activation when semantic enforcement is enabled', async () => {
    const validator = { execute: jest.fn().mockResolvedValue(undefined) };
    const ai = {
      reviewIndexQuality: jest.fn().mockResolvedValue({
        acceptable: false,
        confidence: 0.95,
        summary: 'Grounding problem.',
        issues: [
          {
            category: 'GROUNDING',
            severity: 'HIGH',
            message:
              'Retrieval content is not supported by the supplied evidence.',
          },
        ],
      }),
    };
    const useCase = new ValidatePersistedSemanticCandidateUseCase(
      validator as never,
      ai as never,
      { ...advisoryPolicy, enforced: true },
    );

    await expect(useCase.execute(input)).rejects.toThrow(
      'Semantic quality agent rejected inactive index candidate',
    );
  });

  it('skips semantic review when the policy is disabled', async () => {
    const validator = { execute: jest.fn().mockResolvedValue(undefined) };
    const ai = { reviewIndexQuality: jest.fn() };
    const useCase = new ValidatePersistedSemanticCandidateUseCase(
      validator as never,
      ai as never,
      { ...advisoryPolicy, enabled: false },
    );

    await expect(useCase.execute(input)).resolves.toBeUndefined();
    expect(validator.execute).toHaveBeenCalledTimes(1);
    expect(ai.reviewIndexQuality).not.toHaveBeenCalled();
  });
});
