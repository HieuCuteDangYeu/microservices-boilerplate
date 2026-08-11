import type { VisualFrameSampleReason } from '@common/processing/interfaces/visual-frame-manifest.interface';

export interface VisualSceneEvidence {
  frameKey: string;
  frameChecksum: string;
  timestampMs: number;
  reason: VisualFrameSampleReason;
  caption: string;
  ocrText?: string;
  objects: string[];
  provider: string;
  model: string;
  version: string;
}
