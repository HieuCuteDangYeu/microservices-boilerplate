import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class FailReelIndexingUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(input: {
    reelId: string;
    indexAttemptId: string;
    errorDetail: string;
  }): Promise<boolean> {
    if (!input.reelId?.trim() || !input.indexAttemptId?.trim()) return false;
    return await this.repository.failIndexing(input);
  }
}
