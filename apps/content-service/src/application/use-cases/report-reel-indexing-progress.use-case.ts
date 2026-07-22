import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ReportReelIndexingProgressUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(input: {
    reelId: string;
    indexAttemptId: string;
    stage: string;
    progress: number;
  }): Promise<boolean> {
    if (
      !input.reelId?.trim() ||
      !input.indexAttemptId?.trim() ||
      !input.stage?.trim()
    )
      return false;
    return await this.repository.reportIndexingProgress(input);
  }
}
