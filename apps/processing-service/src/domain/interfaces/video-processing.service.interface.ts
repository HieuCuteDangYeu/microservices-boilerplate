export interface IVideoProcessingService {
  getVideoMetadata(inputPath: string): Promise<{
    durationMs?: number;
    width?: number;
    height?: number;
  }>;

  transcodeToHls(inputPath: string, outputDir: string): Promise<void>;

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
