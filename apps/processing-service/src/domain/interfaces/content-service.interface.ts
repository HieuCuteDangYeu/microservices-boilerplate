import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';

export interface IContentService {
  emitProcessingStarted(data: {
    reelId: string;
    status: 'PROCESSING';
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void>;

  emitProcessingProgress(data: {
    reelId: string;
    status: 'PROCESSING';
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void>;

  emitProcessingCompleted(data: {
    reelId: string;
    status: 'COMPLETED';
    title?: string;
    description?: string;
    tags?: string[];
    transcript?: string;
    transcriptVtt?: string;
    transcriptSegments?: TranscriptSegment[];
    chunks?: ReelChunkIndexInput[];
    thumbnailKey?: string;
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void>;

  emitProcessingFailed(data: {
    reelId: string;
    status: 'FAILED';
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void>;
}
