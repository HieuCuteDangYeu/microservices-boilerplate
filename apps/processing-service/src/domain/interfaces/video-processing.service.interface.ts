export interface VideoMetadata {
  durationMs?: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  hasAudio?: boolean;
  rotation?: number;
}

export interface ReelEncodingVariant {
  name: '360p' | '540p' | '720p' | '1080p';
  width: number;
  height: number;
  bitrateKbps: number;
  maxrateKbps: number;
  bufsizeKbps: number;
  audioBitrateKbps: number;
}

export interface ReelEncodingProfile {
  profileName: 'data_saver' | 'balanced' | 'high';
  outputFps: number;
  segmentSeconds: number;
  x264Preset: string;
  variants: ReelEncodingVariant[];
}

export interface TranscodeToHlsResult {
  variantCount: number;
  maxHeight: number;
  outputFps: number;
  segmentSeconds: number;
  variantNames: string[];
}

export interface IVideoProcessingService {
  getVideoMetadata(inputPath: string): Promise<VideoMetadata>;

  transcodeToHls(
    inputPath: string,
    outputDir: string,
    profile?: ReelEncodingProfile,
  ): Promise<TranscodeToHlsResult>;

  extractAudioForTranscription(
    inputPath: string,
    outputPath: string,
  ): Promise<void>;

  extractThumbnail(
    inputPath: string,
    outputPath: string,
    timestamp?: string,
  ): Promise<void>;
}
