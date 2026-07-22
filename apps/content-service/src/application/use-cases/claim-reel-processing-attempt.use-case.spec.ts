/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

/* eslint-disable @typescript-eslint/unbound-method */

import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { ClaimReelProcessingAttemptUseCase } from './claim-reel-processing-attempt.use-case';

describe('ClaimReelProcessingAttemptUseCase', () => {
  it('ignores a duplicate or stale media attempt', async () => {
    const repository = {
      claimProcessingAttempt: jest.fn().mockResolvedValue(false),
    } as unknown as IContentRepository;
    const useCase = new ClaimReelProcessingAttemptUseCase(repository);

    await expect(
      useCase.execute({ reelId: 'reel-1', processingAttemptId: 'stale-1' }),
    ).resolves.toBe(false);
  });

  it('allows an explicitly redelivered in-progress attempt to be reclaimed', async () => {
    const repository = {
      claimProcessingAttempt: jest.fn().mockResolvedValue(true),
    } as unknown as IContentRepository;
    const useCase = new ClaimReelProcessingAttemptUseCase(repository);

    await expect(
      useCase.execute({
        reelId: 'reel-1',
        processingAttemptId: 'attempt-1',
        allowReclaim: true,
      }),
    ).resolves.toBe(true);
    expect(repository.claimProcessingAttempt).toHaveBeenCalledWith({
      reelId: 'reel-1',
      processingAttemptId: 'attempt-1',
      allowReclaim: true,
    });
  });
});
