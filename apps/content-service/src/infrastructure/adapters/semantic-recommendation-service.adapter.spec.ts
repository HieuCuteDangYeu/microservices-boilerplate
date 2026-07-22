/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

/* eslint-disable @typescript-eslint/unbound-method */

import type { IAiEmbeddingService } from '@content/application/use-cases/ai-embedding.service.interface';
import { SEMANTIC_INDEX_PATTERNS } from '@common/processing/interfaces/semantic-index.interface';
import type { ClientProxy } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { SemanticRecommendationServiceAdapter } from './semantic-recommendation-service.adapter';

describe('SemanticRecommendationServiceAdapter', () => {
  const embedding = {
    generateEmbedding: jest.fn().mockResolvedValue({
      values: Array.from({ length: 384 }, () => 0.1),
      model: 'test',
      dimensions: 384,
    }),
  } as unknown as jest.Mocked<IAiEmbeddingService>;

  it('uses Reel-level semantic search for viewer interests', async () => {
    const indexClient = {
      send: jest.fn().mockReturnValue(
        of([
          {
            id: 'reel-doc-1',
            reelId: 'reel-1',
            userId: 'creator',
            text: 'summary',
            tags: ['travel'],
            sourceDurationMs: 60_000,
            sourceOrientation: 'PORTRAIT',
            sourceLengthClass: 'SHORT',
            rrfScore: 0.03,
            vectorDistance: 0.2,
          },
        ]),
      ),
    } as unknown as jest.Mocked<ClientProxy>;
    const subject = new SemanticRecommendationServiceAdapter(
      embedding,
      indexClient,
    );

    const result = await subject.findCandidates({
      viewerId: 'viewer',
      interestTags: ['Travel'],
      limit: 20,
    });

    expect(indexClient.send).toHaveBeenCalledWith(
      SEMANTIC_INDEX_PATTERNS.SEARCH_REELS,
      expect.objectContaining({
        queryTags: ['travel'],
        limit: 20,
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({ reelId: 'reel-1', source: 'SEMANTIC' }),
    ]);
  });

  it('returns no semantic source when the index is unavailable', async () => {
    const indexClient = {
      send: jest
        .fn()
        .mockReturnValue(throwError(() => new Error('index unavailable'))),
    } as unknown as jest.Mocked<ClientProxy>;
    const subject = new SemanticRecommendationServiceAdapter(
      embedding,
      indexClient,
    );

    await expect(
      subject.findCandidates({
        viewerId: 'viewer',
        interestTags: ['travel'],
        limit: 20,
      }),
    ).resolves.toEqual([]);
  });
});
