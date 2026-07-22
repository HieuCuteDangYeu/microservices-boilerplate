import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { ReelPipelineMetricContext } from '@common/processing/interfaces/reel-pipeline-metric.interface';

export interface ReelProcessingMediaMetadata {
  sourceDurationMs?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceFps?: number;
  sourceBitrateKbps?: number;
  sourceHasAudio?: boolean;
  sourceRotation?: number;
  encodedVariantCount?: number;
  encodedMaxHeight?: number;
  encodedFps?: number;
}

export interface IContentService {
  claimReelProcessingAttempt(data: {
    reelId: string;
    processingAttemptId: string;
    allowReclaim?: boolean;
  }): Promise<boolean>;

  emitProcessingStarted(data: {
    reelId: string;
    status: 'PROCESSING';
    processingAttemptId?: string;
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void>;

  emitProcessingProgress(data: {
    reelId: string;
    status: 'PROCESSING';
    processingAttemptId?: string;
    stage?: string;
    message?: string;
    progress?: number;
  }): Promise<void>;

  persistProcessingRetryScheduled(data: {
    reelId: string;
    status: 'PENDING';
    processingAttemptId: string;
    stage: 'RETRY_SCHEDULED';
    message: string;
    progress: number;
  }): Promise<void>;

  emitProcessingCompleted(data: {
    reelId: string;
    status: 'COMPLETED';
    processingAttemptId?: string;
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
    mediaMetadata?: ReelProcessingMediaMetadata;
    metricsContext?: ReelPipelineMetricContext;
  }): Promise<void>;

  emitProcessingFailed(data: {
    reelId: string;
    status: 'FAILED';
    processingAttemptId?: string;
    stage?: string;
    message?: string;
    progress?: number;
    errorCode?: string;
    errorDetail?: string;
    mediaMetadata?: ReelProcessingMediaMetadata;
    metricsContext?: ReelPipelineMetricContext;
  }): Promise<void>;
}
