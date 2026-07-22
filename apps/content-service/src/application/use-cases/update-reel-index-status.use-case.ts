import type { ReelIndexStatus } from '@common/content/interfaces/reel-state.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class UpdateReelIndexStatusUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(input: {
    reelId: string;
    indexAttemptId: string;
    indexStatus: ReelIndexStatus;
  }): Promise<boolean> {
    if (!input.reelId.trim() || !input.indexAttemptId.trim()) {
      return false;
    }

    return await this.contentRepository.updateIndexStatus(input);
  }
}
