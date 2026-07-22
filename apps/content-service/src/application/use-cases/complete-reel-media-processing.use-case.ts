import { Inject, Injectable } from '@nestjs/common';
import type { ReelMediaOutput } from '@common/processing/interfaces/reel-media-output.interface';
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
    mediaMetadata: ReelProcessingMediaMetadata;
    mediaOutput: ReelMediaOutput;
  }): Promise<boolean> {
    if (
      !input.reelId.trim() ||
      !input.mediaAttemptId.trim() ||
      !input.mediaOutput.thumbnailKey.trim() ||
      !input.mediaOutput.hlsMasterKey.trim() ||
      !input.mediaMetadata.sourceDurationMs ||
      !input.mediaMetadata.sourceOrientation
    ) {
      return false;
    }

    return await this.contentRepository.completeMediaProcessing(input);
  }
}
