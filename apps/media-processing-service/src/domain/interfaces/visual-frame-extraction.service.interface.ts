export interface ExtractedVisualFrame {
  outputPath: string;
  timestampMs: number;
  reason: 'PERIODIC' | 'SCENE_CHANGE';
}

export interface IVisualFrameExtractionService {
  extractCandidateFrames(input: {
    inputPath: string;
    outputDir: string;
    totalDurationMs: number;
    periodicIntervalMs: number;
    sceneThreshold: number;
  }): Promise<ExtractedVisualFrame[]>;
}
