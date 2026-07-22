/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */

import type { IContentService } from '@ai/domain/interfaces/content-service.interface';
import type { IEmbeddingService } from '@ai/domain/interfaces/embedding.service.interface';
import type { IReelSemanticIndexService } from '@ai/domain/interfaces/reel-semantic-index.service.interface';
import type { IRerankerService } from '@ai/domain/interfaces/reranker.service.interface';
import type { IStructuredLlmService } from '@ai/domain/interfaces/structured-llm.service.interface';
import { RetrievalAgentUseCase } from './retrieval-agent.use-case';

describe('RetrievalAgentUseCase Phase 7 hierarchy', () => {
  const route = {
    intent: 'REEL_VIDEO_QUESTION' as const,
    needsRetrieval: true,
    needsMemory: false,
    needsRecommendation: false,
    reason: 'Question refers to shared videos.',
  };

  function createSubject() {
    const structured = {
      generateObject: jest.fn().mockResolvedValue({
        mode: 'REEL_HYBRID',
        query: 'question',
        rewrittenQuery: '',
        queries: ['question'],
        searchLimit: 8,
        rerankLimit: 5,
        shouldRerank: false,
        reason: 'retrieve',
      }),
    } as unknown as jest.Mocked<IStructuredLlmService>;
    const embedding = {
      generateVector: jest.fn().mockResolvedValue({
        values: Array.from({ length: 384 }, () => 0.1),
        model: 'test',
        dimensions: 384,
      }),
    } as unknown as jest.Mocked<IEmbeddingService>;
    const content = {
      resolveReelContextAccess: jest.fn().mockResolvedValue(['short', 'long']),
      searchReelContext: jest.fn(),
    } as unknown as jest.Mocked<IContentService>;
    const semantic = {
      searchReels: jest.fn().mockResolvedValue([
        {
          id: 'reel-doc-short',
          reelId: 'short',
          userId: 'creator-1',
          text: 'short summary',
          tags: ['short'],
          sourceDurationMs: 60_000,
          sourceOrientation: 'PORTRAIT',
          sourceLengthClass: 'SHORT',
          rrfScore: 0.03,
        },
        {
          id: 'reel-doc-long',
          reelId: 'long',
          userId: 'creator-2',
          text: 'long summary',
          tags: ['long'],
          sourceDurationMs: 600_000,
          sourceOrientation: 'LANDSCAPE',
          sourceLengthClass: 'LONG',
          rrfScore: 0.02,
        },
      ]),
      searchSections: jest.fn().mockResolvedValue([
        {
          id: 'section-long-2',
          reelId: 'long',
          parentId: 'reel-doc-long',
          userId: 'creator-2',
          text: 'strong section',
          tags: ['long'],
          sourceDurationMs: 600_000,
          sourceOrientation: 'LANDSCAPE',
          sourceLengthClass: 'LONG',
          rrfScore: 0.03,
        },
      ]),
      searchChunks: jest.fn().mockResolvedValue([
        {
          id: 'chunk-short-1',
          reelId: 'short',
          parentId: 'reel-doc-short',
          userId: 'creator-1',
          text: 'short answer',
          tags: ['short'],
          sourceDurationMs: 60_000,
          sourceOrientation: 'PORTRAIT',
          sourceLengthClass: 'SHORT',
          rrfScore: 0.04,
        },
        {
          id: 'chunk-long-2',
          reelId: 'long',
          parentId: 'section-long-2',
          userId: 'creator-2',
          text: 'long answer',
          tags: ['long'],
          sourceDurationMs: 600_000,
          sourceOrientation: 'LANDSCAPE',
          sourceLengthClass: 'LONG',
          rrfScore: 0.03,
        },
      ]),
      getReelDocument: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IReelSemanticIndexService>;
    const reranker = {
      rerank: jest.fn(),
    } as unknown as jest.Mocked<IRerankerService>;

    return {
      subject: new RetrievalAgentUseCase(
        structured,
        embedding,
        content,
        semantic,
        reranker,
      ),
      content,
      semantic,
    };
  }

  it('searches long-video chunks only under selected sections', async () => {
    const { subject, content, semantic } = createSubject();

    const result = await subject.execute({
      userId: 'viewer',
      conversationId: 'conversation',
      message: 'question',
      route,
    });

    expect(content.resolveReelContextAccess).toHaveBeenCalledWith({
      userId: 'viewer',
      conversationId: 'conversation',
    });
    expect(semantic.searchSections).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ reelIds: ['long'] }),
      }),
    );
    expect(semantic.searchChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          parentIds: ['reel-doc-short', 'section-long-2'],
        }),
      }),
    );
    expect(content.searchReelContext).not.toHaveBeenCalled();
    expect(result.rerankedChunks.map((chunk) => chunk.chunkId)).toEqual([
      'chunk-short-1',
      'chunk-long-2',
    ]);
  });

  it('returns safe empty context before querying the index when no shares are accessible', async () => {
    const { subject, content, semantic } = createSubject();
    content.resolveReelContextAccess.mockResolvedValue([]);

    const result = await subject.execute({
      userId: 'viewer',
      conversationId: 'conversation',
      message: 'question',
      route,
    });

    expect(result.rerankedChunks).toEqual([]);
    expect(semantic.searchReels).not.toHaveBeenCalled();
  });
});
