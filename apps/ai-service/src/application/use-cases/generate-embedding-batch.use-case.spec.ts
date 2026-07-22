import { ConfigService } from '@nestjs/config';
import { GenerateEmbeddingBatchUseCase } from './generate-embedding-batch.use-case';

describe('GenerateEmbeddingBatchUseCase', () => {
  it('bounds provider concurrency and preserves stable input order', async () => {
    let active = 0;
    let maximumActive = 0;
    const embeddingService = {
      generateVector: jest.fn(async ({ text }: { text: string }) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) =>
          setTimeout(resolve, text === 'first' ? 5 : 1),
        );
        active -= 1;
        return { values: [1], model: 'model', dimensions: 1 };
      }),
    };
    const useCase = new GenerateEmbeddingBatchUseCase(
      new ConfigService({ AI_EMBEDDING_BATCH_CONCURRENCY: '2' }),
      embeddingService,
    );

    const result = await useCase.execute({
      items: [
        { id: 'stable-1', text: 'first' },
        { id: 'stable-2', text: 'second' },
        { id: 'stable-3', text: 'third' },
      ],
    });

    expect(maximumActive).toBe(2);
    expect(result.embeddings.map((item) => item.id)).toEqual([
      'stable-1',
      'stable-2',
      'stable-3',
    ]);
  });

  it('returns successful items alongside per-item errors', async () => {
    const embeddingService = {
      generateVector: jest.fn(({ text }: { text: string }) => {
        if (text === 'fail')
          return Promise.reject(new Error('provider failed'));
        return Promise.resolve({ values: [1], model: 'model', dimensions: 1 });
      }),
    };
    const useCase = new GenerateEmbeddingBatchUseCase(
      new ConfigService(),
      embeddingService,
    );
    const result = await useCase.execute({
      items: [
        { id: 'ok', text: 'success' },
        { id: 'bad', text: 'fail' },
      ],
    });
    expect(result.embeddings).toEqual([
      expect.objectContaining({ id: 'ok', values: [1] }),
    ]);
    expect(result.errors).toEqual([{ id: 'bad', error: 'provider failed' }]);
  });
});
