import type { CompleteReelIndexCommand } from '@common/processing/interfaces/complete-reel-index.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { IIndexingContentService } from '@indexing/domain/interfaces/content-service.interface';
import type { ISemanticCandidateLifecycle } from '@indexing/domain/interfaces/semantic-candidate-lifecycle.interface';
import { CommitSemanticCandidateUseCase } from './commit-semantic-candidate.use-case';

const job = {
  reelId: 'reel-1',
  indexAttemptId: 'attempt-2',
} as ReelIndexJob;

const completion = {
  reelId: 'reel-1',
  indexAttemptId: 'attempt-2',
} as CompleteReelIndexCommand;

const buildContent = (): jest.Mocked<IIndexingContentService> =>
  ({
    claimIndexingAttempt: jest.fn(),
    isIndexingAttemptCurrent: jest.fn(),
    reportProgress: jest.fn(),
    completeIndexing: jest.fn(),
    failIndexing: jest.fn(),
    reindexReel: jest.fn(),
  }) as jest.Mocked<IIndexingContentService>;

const buildLifecycle = (): jest.Mocked<ISemanticCandidateLifecycle> =>
  ({
    activateCandidate: jest.fn(),
    rollbackCandidate: jest.fn(),
    finalizeCandidate: jest.fn(),
    discardCandidate: jest.fn(),
  }) as jest.Mocked<ISemanticCandidateLifecycle>;

describe('CommitSemanticCandidateUseCase', () => {
  it('discards an inactive candidate when the attempt is already stale', async () => {
    const content = buildContent();
    const lifecycle = buildLifecycle();
    content.isIndexingAttemptCurrent.mockResolvedValue(false);
    lifecycle.discardCandidate.mockResolvedValue();
    const useCase = new CommitSemanticCandidateUseCase(content, lifecycle);

    await expect(useCase.execute({ job, completion })).resolves.toBe('STALE');
    expect(lifecycle.activateCandidate).not.toHaveBeenCalled();
    expect(lifecycle.discardCandidate).toHaveBeenCalledWith({
      reelId: 'reel-1',
      indexAttemptId: 'attempt-2',
    });
  });

  it('rolls back the previous active candidate when content rejects the commit', async () => {
    const content = buildContent();
    const lifecycle = buildLifecycle();
    content.isIndexingAttemptCurrent.mockResolvedValue(true);
    content.completeIndexing.mockResolvedValue(false);
    lifecycle.activateCandidate.mockResolvedValue({
      previousIndexAttemptId: 'attempt-1',
    });
    lifecycle.rollbackCandidate.mockResolvedValue();
    lifecycle.discardCandidate.mockResolvedValue();
    const useCase = new CommitSemanticCandidateUseCase(content, lifecycle);

    await expect(useCase.execute({ job, completion })).resolves.toBe('STALE');
    expect(lifecycle.rollbackCandidate).toHaveBeenCalledWith({
      reelId: 'reel-1',
      indexAttemptId: 'attempt-2',
      previousIndexAttemptId: 'attempt-1',
    });
    expect(lifecycle.finalizeCandidate).not.toHaveBeenCalled();
  });

  it('finalizes the accepted semantic candidate', async () => {
    const content = buildContent();
    const lifecycle = buildLifecycle();
    content.isIndexingAttemptCurrent.mockResolvedValue(true);
    content.completeIndexing.mockResolvedValue(true);
    lifecycle.activateCandidate.mockResolvedValue({
      previousIndexAttemptId: 'attempt-1',
    });
    lifecycle.finalizeCandidate.mockResolvedValue();
    const useCase = new CommitSemanticCandidateUseCase(content, lifecycle);

    await expect(useCase.execute({ job, completion })).resolves.toBe('COMPLETED');
    expect(lifecycle.finalizeCandidate).toHaveBeenCalledWith({
      reelId: 'reel-1',
      indexAttemptId: 'attempt-2',
    });
    expect(lifecycle.rollbackCandidate).not.toHaveBeenCalled();
  });
});
