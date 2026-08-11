export interface AnalyzeVisualFrameRequest {
  imageBase64: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
  timestampMs?: number;
}

export interface VisualFrameAnalysis {
  caption: string;
  ocrText?: string;
  objects: string[];
  provider: string;
  model: string;
  version: string;
}
