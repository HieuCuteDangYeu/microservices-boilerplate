import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { IContentRepository } from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CompleteReelIndexingUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly repository: IContentRepository,
  ) {}

  async execute(input: {
    reelId: string;
    indexAttemptId: string;
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    metadata: ExtractedReelMetadata;
    chunks: ReelChunkIndexInput[];
  }): Promise<boolean> {
    if (!input.reelId?.trim() || !input.indexAttemptId?.trim()) return false;
    return await this.repository.completeIndexing(input);
  }
}
