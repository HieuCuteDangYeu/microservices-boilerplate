import type { IContentService } from '@ai/domain/interfaces/content-service.interface';
import type { IEmbeddingService } from '@ai/domain/interfaces/embedding.service.interface';
import type {
  RagChatRouteDecision,
  RagRetrievalPlan,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type { IRagHierarchyShadowObservationRepository } from '@ai/domain/interfaces/rag-hierarchy-shadow-observation.repository.interface';
import type { IRerankerService } from '@ai/domain/interfaces/reranker.service.interface';
import type { IReelSemanticIndexService } from '@ai/domain/interfaces/reel-semantic-index.service.interface';
import type { IStructuredLlmService } from '@ai/domain/interfaces/structured-llm.service.interface';
import type {
  SemanticIndexSearchRequest,
  SemanticIndexSearchResult,
  SemanticReelDocument,
} from '@common/processing/interfaces/semantic-index.interface';
import { ConfigService } from '@nestjs/config';
import { RetrievalAgentUseCase } from './retrieval-agent.use-case';

const route: RagChatRouteDecision = {
  intent: 'REEL_VIDEO_QUESTION',
  needsRetrieval: true,
  needsUserMemory: false,
  needsConversationSummary: false,
  needsVerification: true,
  reelQuestionType: 'TRANSCRIPT_CONTENT',
  requiredEvidence: ['TRANSCRIPT'],
  recommendationAction: {
    type: 'NONE',
    reason: 'No recommendation needed.',
  },
  reason: 'Question asks about spoken reel content.',
};

const plan: RagRetrievalPlan = {
  mode: 'REEL_HYBRID',
  query: 'What project name is spoken?',
  queries: ['What project name is spoken?'],
  searchLimit: 8,
  rerankLimit: 5,
  shouldRerank: false,
  reason: 'Test retrieval plan.',
};

const buildCandidate = (
  id: string,
  parentId: string,
): SemanticIndexSearchResult => ({
  id,
  reelId: 'reel-1',
  parentId,
  ordinal: 0,
  userId: 'creator-1',
  text: `evidence ${id}`,
  retrievalText: `retrieval ${id}`,
  evidenceText: `evidence ${id}`,
  evidenceType: 'TRANSCRIPT',
  tags: [],
  startTime: 0,
  endTime: 5,
  sourceDurationMs: 30_000,
  sourceOrientation: 'PORTRAIT',
  sourceLengthClass: 'SHORT',
  rrfScore: 0.03,
  vectorDistance: 0.1,
  vectorRank: 1,
});

const reelCandidate: SemanticIndexSearchResult = {
  ...buildCandidate('reel-document-1', 'root'),
  parentId: undefined,
  evidenceType: 'METADATA',
};
const directCandidate = buildCandidate('chunk-direct', 'reel-document-1');
const hierarchicalCandidate = buildCandidate(
  'chunk-hierarchical',
  'reel-document-1',
);

const reelDocument: SemanticReelDocument = {
  id: 'reel-document-1',
  reelId: 'reel-1',
  userId: 'creator-1',
  title: 'Test reel',
  description: 'Test description',
  text: 'Test reel',
  tags: [],
  sourceDurationMs: 30_000,
  sourceOrientation: 'PORTRAIT',
  sourceLengthClass: 'SHORT',
  indexAttemptId: 'attempt-1',
  indexVersion: 'v1',
  embeddingProvider: 'test',
  embeddingModel: 'test',
  embeddingDimensions: 384,
  embeddingVersion: 'v1',
  chunkingVersion: 'v1',
  summaryVersion: 'v1',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const buildUseCase = (configValues: Record<string, string>) => {
  const embeddingService: IEmbeddingService = {
    generateVector: jest.fn().mockResolvedValue({
      values: Array.from({ length: 384 }, () => 0.01),
      model: 'test',
      dimensions: 384,
      provider: 'test',
      version: 'v1',
    }),
    countTokens: jest.fn(),
  };
  const contentService: IContentService = {
    resolveReelContextAccess: jest.fn().mockResolvedValue(['reel-1']),
    searchPublicReels: jest.fn(),
    getRecommendedReels: jest.fn(),
  };
  const searchChunks = jest.fn(
    (input: SemanticIndexSearchRequest): Promise<SemanticIndexSearchResult[]> =>
      Promise.resolve(
        input.filters?.parentIds ? [hierarchicalCandidate] : [directCandidate],
      ),
  );
  const semanticIndexService: IReelSemanticIndexService = {
    searchReels: jest.fn().mockResolvedValue([reelCandidate]),
    searchSections: jest.fn().mockResolvedValue([]),
    searchChunks,
    searchVisualScenes: jest.fn().mockResolvedValue([]),
    getAdjacentChunks: jest.fn().mockResolvedValue([]),
    getReelDocument: jest.fn().mockResolvedValue(reelDocument),
  };
  const hierarchyObservationRepository: IRagHierarchyShadowObservationRepository =
    {
      save: jest.fn().mockResolvedValue(undefined),
    };

  const useCase = new RetrievalAgentUseCase(
    {} as IStructuredLlmService,
    embeddingService,
    contentService,
    semanticIndexService,
    {} as IRerankerService,
    hierarchyObservationRepository,
    new ConfigService(configValues),
  );

  return { hierarchyObservationRepository, searchChunks, useCase };
};

describe('RetrievalAgentUseCase hierarchy rollout', () => {
  it('serves direct retrieval and forces shadow when production hierarchy is requested without approval', async () => {
    const { hierarchyObservationRepository, searchChunks, useCase } =
      buildUseCase({
        NODE_ENV: 'production',
        RAG_HIERARCHICAL_RETRIEVAL_ENABLED: 'true',
        RAG_HIERARCHICAL_RETRIEVAL_SHADOW_ENABLED: 'false',
        RAG_HIERARCHICAL_RETRIEVAL_PROMOTION_APPROVED: 'false',
      });

    const result = await useCase.retrieve({
      userId: 'user-1',
      conversationId: 'conversation-1',
      route,
      plan,
    });

    expect(result.map((item) => item.chunkId)).toContain('chunk-direct');
    expect(result.map((item) => item.chunkId)).not.toContain(
      'chunk-hierarchical',
    );
    expect(searchChunks).toHaveBeenCalledWith(
      expect.objectContaining({ filters: { reelIds: ['reel-1'] } }),
    );
    expect(hierarchyObservationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        conversationId: 'conversation-1',
        directChunkIds: expect.arrayContaining(['chunk-direct']),
        hierarchicalChunkIds: expect.arrayContaining(['chunk-hierarchical']),
      }),
    );
  });

  it('allows hierarchical serving in production only with explicit promotion approval', async () => {
    const { hierarchyObservationRepository, useCase } = buildUseCase({
      NODE_ENV: 'production',
      RAG_HIERARCHICAL_RETRIEVAL_ENABLED: 'true',
      RAG_HIERARCHICAL_RETRIEVAL_SHADOW_ENABLED: 'false',
      RAG_HIERARCHICAL_RETRIEVAL_PROMOTION_APPROVED: 'true',
    });

    const result = await useCase.retrieve({
      userId: 'user-1',
      conversationId: 'conversation-1',
      route,
      plan,
    });

    expect(result.map((item) => item.chunkId)).toContain('chunk-hierarchical');
    expect(result.map((item) => item.chunkId)).not.toContain('chunk-direct');
    expect(hierarchyObservationRepository.save).not.toHaveBeenCalled();
  });
});
