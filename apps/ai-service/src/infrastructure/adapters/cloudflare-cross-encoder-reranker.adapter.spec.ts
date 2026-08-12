import type { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import type { ConfigService } from '@nestjs/config';
import { CloudflareCrossEncoderRerankerAdapter } from './cloudflare-cross-encoder-reranker.adapter';
import type { SimpleRerankerAdapter } from './simple-reranker.adapter';

describe('CloudflareCrossEncoderRerankerAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const candidates: ReelContextSearchResult[] = [
    {
      chunkId: 'a',
      reelId: 'reel-1',
      tags: [],
      chunkText: 'The weather is sunny.',
      retrievalText: 'The weather is sunny.',
      evidenceText: 'The weather is sunny.',
      evidenceType: 'TRANSCRIPT',
      distance: 0.1,
      score: 0.03,
    },
    {
      chunkId: 'b',
      reelId: 'reel-2',
      tags: ['nestjs'],
      chunkText: 'NestJS dependency injection uses providers and tokens.',
      retrievalText: 'NestJS dependency injection uses providers and tokens.',
      evidenceText: 'NestJS dependency injection uses providers and tokens.',
      evidenceType: 'TRANSCRIPT',
      distance: 0.2,
      score: 0.02,
    },
  ];

  const configValues: Record<string, string> = {
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
    CLOUDFLARE_API_TOKEN: 'token',
    AI_RAG_NEURAL_RERANK_ENABLED: 'true',
  };

  const createConfig = () =>
    ({
      get: jest.fn((key: string) => configValues[key]),
      getOrThrow: jest.fn((key: string) => {
        const value = configValues[key];
        if (!value) throw new Error(`Missing ${key}`);
        return value;
      }),
    }) as unknown as ConfigService;

  it('uses cross-encoder scores to reorder retrieved candidates', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          result: {
            response: [
              { id: 1, score: 4 },
              { id: 0, score: -1 },
            ],
          },
        }),
    }) as unknown as typeof fetch;

    const fallback = {
      rerank: jest.fn(),
    } as unknown as SimpleRerankerAdapter;
    const adapter = new CloudflareCrossEncoderRerankerAdapter(
      createConfig(),
      fallback,
    );

    const result = await adapter.rerank({
      queryText: 'How does NestJS dependency injection work?',
      candidates,
      limit: 2,
    });

    expect(result.map((candidate) => candidate.chunkId)).toEqual(['b', 'a']);
    expect(result[0].rerankScore).toBeGreaterThan(result[1].rerankScore ?? 0);
    expect(fallback.rerank).not.toHaveBeenCalled();
  });

  it('uses the deterministic reranker when Cloudflare fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ success: false }),
    }) as unknown as typeof fetch;

    const fallbackResult = [candidates[0]];
    const fallback = {
      rerank: jest.fn().mockResolvedValue(fallbackResult),
    } as unknown as SimpleRerankerAdapter;
    const adapter = new CloudflareCrossEncoderRerankerAdapter(
      createConfig(),
      fallback,
    );

    await expect(
      adapter.rerank({
        queryText: 'How does NestJS dependency injection work?',
        candidates,
        limit: 1,
      }),
    ).resolves.toEqual(fallbackResult);
    expect(fallback.rerank).toHaveBeenCalled();
  });
});
