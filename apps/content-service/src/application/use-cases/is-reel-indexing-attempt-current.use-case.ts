import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class IsReelIndexingAttemptCurrentUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<boolean> {
    if (!input.reelId?.trim() || !input.indexAttemptId?.trim()) return false;
    return await this.repository.isIndexingAttemptCurrent({
      reelId: input.reelId.trim(),
      indexAttemptId: input.indexAttemptId.trim(),
    });
  }
}
