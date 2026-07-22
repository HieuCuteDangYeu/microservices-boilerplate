import { Inject, Injectable } from '@nestjs/common';
import type {
  IContentRepository,
  ReelProcessingMediaMetadata,
} from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class CompleteReelMediaProcessingUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(input: {
    reelId: string;
    mediaAttemptId: string;
    thumbnailKey: string;
    mediaMetadata: ReelProcessingMediaMetadata;
  }): Promise<boolean> {
    if (
      !input.reelId.trim() ||
      !input.mediaAttemptId.trim() ||
      !input.thumbnailKey.trim()
    ) {
      return false;
    }

    return await this.contentRepository.completeMediaProcessing(input);
  }
}
