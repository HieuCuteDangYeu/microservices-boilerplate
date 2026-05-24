import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';

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
    transcript?: string;
    transcriptVtt?: string;
    transcriptSegments?: TranscriptSegment[];
    embedding?: number[];
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
