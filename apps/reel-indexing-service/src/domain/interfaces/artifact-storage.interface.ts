import type { TranscriptionAudioManifest } from '@common/processing/interfaces/transcription-audio-manifest.interface';
import type { VisualFrameManifest } from '@common/processing/interfaces/visual-frame-manifest.interface';

export interface IArtifactStorage {
  getTranscriptionAudioManifest(
    key: string,
  ): Promise<TranscriptionAudioManifest>;
  getVisualFrameManifest(key: string): Promise<VisualFrameManifest>;
  getArtifactBuffer(key: string): Promise<Buffer>;
  artifactExists(key: string): Promise<boolean>;
}
