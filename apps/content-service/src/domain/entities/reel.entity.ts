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
  embedding?: number[];
  thumbnailKey?: string;
  processingStage?: string;
  processingMessage?: string;
  processingProgress?: number;
  createdAt: Date;
  updatedAt: Date;
}
