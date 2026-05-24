import { ReelProcessingStatus } from '@common/content/interfaces/reel-processing-status.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class GetReelStatusUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(reelId: string): Promise<ReelProcessingStatus> {
    const reel = await this.contentRepository.findById(reelId);

    if (!reel) {
      return {
        reelId,
        status: 'NOT_FOUND',
      };
    }

    return {
      reelId: reel.id,
      userId: reel.userId,
      visibility: reel.visibility,
      status: reel.status,
      stage: reel.processingStage,
      message: reel.processingMessage,
      progress: reel.processingProgress,
      mediaKey: reel.mediaKey,
      thumbnailKey: reel.thumbnailKey,
    };
  }
}
