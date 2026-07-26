import type { CompleteReelIndexCommand } from '@common/processing/interfaces/complete-reel-index.interface';
import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CompleteReelIndexingUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(input: CompleteReelIndexCommand): Promise<boolean> {
    if (!input.reelId?.trim() || !input.indexAttemptId?.trim()) return false;
    return await this.repository.completeIndexing(input);
  }
}
