import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';

export const INDEX_CHECKPOINT_STAGES = [
  'TRANSCRIBING_AUDIO_SEGMENTS',
  'MERGING_TRANSCRIPT',
  'EXTRACTING_METADATA',
  'BUILDING_SECTIONS',
  'BUILDING_CHUNKS',
  'EMBEDDING',
  'VALIDATING',
  'PERSISTING',
] as const;

export type IndexCheckpointStage = (typeof INDEX_CHECKPOINT_STAGES)[number];
export type IndexJobStatus = 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type AudioSegmentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface TranscriptSection {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  summary?: string;
}

export interface IndexJobCheckpoint {
  indexAttemptId: string;
  jobId: string;
  reelId: string;
  mediaAttemptId: string;
  indexVersion: string;
  status: IndexJobStatus;
  stage: IndexCheckpointStage;
  mergedTranscript?: string;
  mergedSegments?: TranscriptSegment[];
  extractedMetadata?: ExtractedReelMetadata;
  sections?: TranscriptSection[];
  chunks?: ReelChunkIndexInput[];
  lastError?: string;
}

export interface AudioSegmentCheckpoint {
  indexAttemptId: string;
  segmentNumber: number;
  artifactKey: string;
  artifactChecksum: string;
  startMs: number;
  endMs: number;
  overlapBeforeMs: number;
  provider?: string;
  transcriptionModel?: string;
  transcriptionVersion?: string;
  status: AudioSegmentStatus;
  attemptCount: number;
  transcriptText?: string;
  transcriptSegments?: TranscriptSegment[];
  lastError?: string;
}
