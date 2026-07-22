import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { IndexCheckpointStage } from '../entities/index-checkpoint.entity';

export interface IIndexingContentService {
  claimIndexingAttempt(input: {
    reelId: string;
    indexAttemptId: string;
    allowReclaim?: boolean;
  }): Promise<boolean>;

  reportProgress(input: {
    reelId: string;
    indexAttemptId: string;
    stage: IndexCheckpointStage;
    progress: number;
  }): Promise<void>;

  completeIndexing(input: {
    reelId: string;
    indexAttemptId: string;
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    metadata: ExtractedReelMetadata;
    chunks: ReelChunkIndexInput[];
  }): Promise<boolean>;

  failIndexing(input: {
    reelId: string;
    indexAttemptId: string;
    errorDetail: string;
  }): Promise<void>;
}
