import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ReindexReelUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(
    reelId: string,
  ): Promise<{ queued: boolean; indexAttemptId?: string }> {
    if (!reelId?.trim()) return { queued: false };
    const indexAttemptId = await this.repository.queueReelIndexingAttempt(
      reelId.trim(),
    );
    return indexAttemptId
      ? { queued: true, indexAttemptId }
      : { queued: false };
  }
}
