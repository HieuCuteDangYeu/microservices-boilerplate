import type { ReelMediaStatus } from '@common/content/interfaces/reel-state.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class UpdateReelMediaStatusUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(input: {
    reelId: string;
    mediaAttemptId: string;
    mediaStatus: ReelMediaStatus;
  }): Promise<boolean> {
    if (!input.reelId.trim() || !input.mediaAttemptId.trim()) {
      return false;
    }

    return await this.contentRepository.updateMediaStatus(input);
  }
}
