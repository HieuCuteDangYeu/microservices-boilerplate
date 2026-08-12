import type { IIndexAttemptReadRepository } from '@content/domain/interfaces/index-attempt-read.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class IsReelIndexingAttemptCurrentUseCase {
  constructor(
    @Inject('IIndexAttemptReadRepository')
    private readonly repository: IIndexAttemptReadRepository,
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
