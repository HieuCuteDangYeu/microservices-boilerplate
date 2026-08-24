import { CloudflareEmbeddingAdapter } from './cloudflare-embedding.adapter';

const configValues: Record<string, string> = {
  AI_EMBEDDING_MODEL: '@cf/baai/bge-m3',
  AI_EMBEDDING_DIMENSIONS: '1024',
  AI_EMBEDDING_VERSION: 'cf-bge-m3-v1',
  AI_EMBEDDING_TIMEOUT_MS: '12000',
  CLOUDFLARE_ACCOUNT_ID: 'test-account',
  CLOUDFLARE_API_TOKEN: 'test-token',
  CLOUDFLARE_AI_GATEWAY_ENABLED: 'false',
};

const config = {
  get: jest.fn((key: string) => configValues[key]),
};

describe('CloudflareEmbeddingAdapter BGE-M3 identity', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a normalized 1024-dimensional BGE-M3 embedding', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: { data: [Array.from({ length: 1024 }, () => 1)] },
        }),
        { status: 200 },
      ),
    );
    const adapter = new CloudflareEmbeddingAdapter(config as never);

    const result = await adapter.generateVector({
      text: 'semantic retrieval',
      taskType: 'RETRIEVAL_QUERY',
    });

    expect(result).toMatchObject({
      provider: 'cloudflare-workers-ai',
      model: '@cf/baai/bge-m3',
      dimensions: 1024,
      version: 'cf-bge-m3-v1',
    });
    expect(result.values).toHaveLength(1024);
    expect(result.values.every(Number.isFinite)).toBe(true);
  });

  it('rejects a provider response with the old 384 dimensions', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: { data: [Array.from({ length: 384 }, () => 1)] },
        }),
        { status: 200 },
      ),
    );
    const adapter = new CloudflareEmbeddingAdapter(config as never);

    await expect(
      adapter.generateVector({
        text: 'semantic retrieval',
        taskType: 'RETRIEVAL_QUERY',
      }),
    ).rejects.toThrow('must return 1024 finite values');
  });
});
