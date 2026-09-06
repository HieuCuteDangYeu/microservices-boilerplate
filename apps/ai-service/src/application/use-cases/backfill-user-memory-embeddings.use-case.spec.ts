import type { IAiApplicationConfig } from '@ai/domain/interfaces/ai-application-config.interface';
import { UserMemory } from '@ai/domain/entities/user-memory.entity';
import { BackfillUserMemoryEmbeddingsUseCase } from './backfill-user-memory-embeddings.use-case';

describe('BackfillUserMemoryEmbeddingsUseCase', () => {
  it('embeds normalized memory content and persists the full embedding identity', async () => {
    const memory = new UserMemory({
      id: 'memory-1',
      userId: 'user-1',
      type: 'TECHNICAL_CONTEXT',
      content: 'The user deploys PostgreSQL with pgvector.',
      normalizedContent: 'the user deploys postgresql with pgvector.',
      confidence: 0.9,
    });
    const repository = {
      findWithoutEmbedding: jest.fn().mockResolvedValue([memory]),
      getEmbeddingDimensions: jest.fn().mockResolvedValue(1024),
      updateEmbedding: jest.fn().mockResolvedValue(undefined),
    };
    const embeddingService = {
      generateVector: jest.fn().mockResolvedValue({
        values: Array.from({ length: 1024 }, () => 0.01),
        model: 'BAAI/bge-m3',
        dimensions: 1024,
      }),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'AI_EMBEDDING_MODEL'
          ? 'BAAI/bge-m3'
          : key === 'AI_EMBEDDING_VERSION'
            ? 'bge-m3-tei-v1'
            : undefined,
      ),
    } as unknown as IAiApplicationConfig;
    const useCase = new BackfillUserMemoryEmbeddingsUseCase(
      config,
      repository as never,
      embeddingService as never,
    );

    await expect(useCase.execute()).resolves.toEqual({
      scanned: 1,
      updated: 1,
      failed: 0,
    });
    expect(embeddingService.generateVector).toHaveBeenCalledWith(
      expect.objectContaining({
        text: [
          'Memory type: TECHNICAL_CONTEXT',
          'Memory content: the user deploys postgresql with pgvector.',
        ].join('\n'),
      }),
    );
    expect(repository.updateEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryId: 'memory-1',
        embeddingModel: 'BAAI/bge-m3',
        embeddingDimensions: 1024,
        embeddingVersion: 'bge-m3-tei-v1',
      }),
    );
  });

  it('does not write when the generated dimension differs from storage', async () => {
    const repository = {
      findWithoutEmbedding: jest.fn().mockResolvedValue([
        new UserMemory({
          id: 'memory-1',
          userId: 'user-1',
          type: 'PROFILE',
          content: 'The user is a backend engineer.',
          normalizedContent: 'the user is a backend engineer.',
          confidence: 0.9,
        }),
      ]),
      getEmbeddingDimensions: jest.fn().mockResolvedValue(384),
      updateEmbedding: jest.fn(),
    };
    const embeddingService = {
      generateVector: jest.fn().mockResolvedValue({
        values: Array.from({ length: 1024 }, () => 0.01),
        model: 'BAAI/bge-m3',
        dimensions: 1024,
      }),
    };
    const useCase = new BackfillUserMemoryEmbeddingsUseCase(
      {
        get: jest.fn((key: string) =>
          key === 'AI_EMBEDDING_MODEL' ? 'BAAI/bge-m3' : 'bge-m3-tei-v1',
        ),
      } as unknown as IAiApplicationConfig,
      repository as never,
      embeddingService as never,
    );

    await expect(useCase.execute()).resolves.toEqual({
      scanned: 1,
      updated: 0,
      failed: 1,
    });
    expect(repository.updateEmbedding).not.toHaveBeenCalled();
  });
});
