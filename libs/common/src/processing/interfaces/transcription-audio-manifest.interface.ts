export type TranscriptionAudioFormat = 'wav' | 'flac';

export interface TranscriptionAudioArtifact {
  key: string;
  startMs: number;
  endMs: number;
  overlapBeforeMs: number;
  checksum: string;
  byteLength: number;
}

export interface TranscriptionAudioManifest {
  reelId: string;
  mediaAttemptId: string;
  totalDurationMs: number;
  format: TranscriptionAudioFormat;
  artifacts: TranscriptionAudioArtifact[];
  version: 1;
}
