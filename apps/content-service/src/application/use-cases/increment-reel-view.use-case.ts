import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class IncrementReelViewUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(reelId: string): Promise<void> {
    try {
      await this.repository.incrementViewCount(reelId);
    } catch {
      // Swallow — a missed view count is non-critical
    }
  }
}