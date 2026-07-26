/**
 * TEMPORARY REEL INDEXING/RETRIEVAL MIGRATION TEST
 * Remove only after production validation.
 */

import type { CompleteReelIndexCommand } from '@common/processing/interfaces/complete-reel-index.interface';
import { CompleteReelIndexingUseCase } from './complete-reel-indexing.use-case';

const command: CompleteReelIndexCommand = {
  reelId: 'reel-id',
  indexAttemptId: 'index-attempt-id',
  indexVersion: 'reel-index-v2',
  reelDocumentCount: 1,
  sectionCount: 0,
  chunkCount: 1,
  embeddingProvider: 'test-provider',
  embeddingModel: 'test-model',
  embeddingDimensions: 384,
  embeddingVersion: 'test-embedding-v1',
  indexedAt: '2026-07-26T00:00:00.000Z',
};

describe('Prompt 4 summary-only index completion', () => {
  it('forwards only the index summary to Content persistence', async () => {
    const repository = { completeIndexing: jest.fn().mockResolvedValue(true) };
    const useCase = new CompleteReelIndexingUseCase(repository as never);

    await expect(useCase.execute(command)).resolves.toBe(true);
    expect(repository.completeIndexing).toHaveBeenCalledWith(command);
    expect(repository.completeIndexing.mock.calls[0][0]).not.toHaveProperty(
      'chunks',
    );
    expect(repository.completeIndexing.mock.calls[0][0]).not.toHaveProperty(
      'embedding',
    );
  });
});
