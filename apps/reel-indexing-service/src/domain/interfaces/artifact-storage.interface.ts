import type { TranscriptionAudioManifest } from '@common/processing/interfaces/transcription-audio-manifest.interface';

export interface IArtifactStorage {
  getTranscriptionAudioManifest(
    key: string,
  ): Promise<TranscriptionAudioManifest>;
}
