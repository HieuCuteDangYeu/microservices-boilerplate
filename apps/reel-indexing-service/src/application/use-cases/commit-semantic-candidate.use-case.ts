import type { CompleteReelIndexCommand } from '@common/processing/interfaces/complete-reel-index.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { IIndexingContentService } from '@indexing/domain/interfaces/content-service.interface';
import type { ISemanticCandidateLifecycle } from '@indexing/domain/interfaces/semantic-candidate-lifecycle.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

export type SemanticCandidateCommitStatus = 'COMPLETED' | 'STALE';

@Injectable()
export class CommitSemanticCandidateUseCase {
  private readonly logger = new Logger(CommitSemanticCandidateUseCase.name);

  constructor(
    @Inject('IIndexingContentService')
    private readonly content: IIndexingContentService,
    @Inject('ISemanticCandidateLifecycle')
    private readonly lifecycle: ISemanticCandidateLifecycle,
  ) {}

  async execute(input: {
    job: ReelIndexJob;
    completion: CompleteReelIndexCommand;
  }): Promise<SemanticCandidateCommitStatus> {
    const identity = {
      reelId: input.job.reelId,
      indexAttemptId: input.job.indexAttemptId,
    };

    const current = await this.content.isIndexingAttemptCurrent(identity);
    if (!current) {
      await this.lifecycle.discardCandidate(identity);
      return 'STALE';
    }

    const activation = await this.lifecycle.activateCandidate(identity);

    try {
      const applied = await this.content.completeIndexing(input.completion);
      if (!applied) {
        await this.lifecycle.rollbackCandidate({
          ...identity,
          previousIndexAttemptId: activation.previousIndexAttemptId,
        });
        await this.lifecycle.discardCandidate(identity);
        return 'STALE';
      }
    } catch (error: unknown) {
      await this.lifecycle
        .rollbackCandidate({
          ...identity,
          previousIndexAttemptId: activation.previousIndexAttemptId,
        })
        .catch((rollbackError: unknown) => {
          this.logger.error(
            `[SemanticCommit] rollback failed after content completion error: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
          );
        });
      throw error;
    }

    try {
      await this.lifecycle.finalizeCandidate(identity);
    } catch (error: unknown) {
      // The content service has already atomically accepted this attempt and the
      // new candidate is active. Old inactive rows are harmless; keep serving
      // the accepted candidate and surface cleanup as an operational warning.
      this.logger.error(
        `[SemanticCommit] post-commit cleanup failed for ${input.job.indexAttemptId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return 'COMPLETED';
  }
}
