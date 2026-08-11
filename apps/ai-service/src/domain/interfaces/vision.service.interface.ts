import type { VisualFrameAnalysis } from '@common/ai/interfaces/visual-analysis.interface';

export interface IVisionService {
  analyzeImage(input: {
    image: Buffer;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  }): Promise<VisualFrameAnalysis>;
}
