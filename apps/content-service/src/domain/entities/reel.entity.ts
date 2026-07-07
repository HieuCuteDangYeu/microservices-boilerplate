import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';

export class Reel {
  id: string;
  userId: string;
  mediaKey: string;
  title?: string;
  description?: string;
  tags: string[];
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  visibility: 'public' | 'private';
  viewCount: bigint;
  transcript?: string;
  transcriptVtt?: string;
  transcriptSegments?: TranscriptSegment[];
  thumbnailKey?: string;
  processingStage?: string;
  processingMessage?: string;
  processingProgress?: number;
  processingAttemptId?: string;
  processingStartedAt?: Date;
  processingFailedAt?: Date;
  processingCompletedAt?: Date;
  processingErrorCode?: string;
  processingErrorDetail?: string;
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
  createdAt: Date;
  updatedAt: Date;
}
