export type ReelPipelineOrientation =
  | 'PORTRAIT'
  | 'LANDSCAPE'
  | 'SQUARE'
  | 'UNKNOWN';

export type ReelPipelineMediaClass = 'SHORT' | 'LONG' | 'UNKNOWN';

export interface ReelPipelineMetricContext {
  reelId: string;
  processingAttemptId: string;
  mediaClass: ReelPipelineMediaClass;
  orientation: ReelPipelineOrientation;
  retryNumber: number;
}

export interface ReelPipelineMetricRecord extends ReelPipelineMetricContext {
  event: 'reel_pipeline_metric';
  timestamp: string;
  stage: string;
  success: boolean;
  durationMs: number;
  failureStage?: string;
  [key: string]: unknown;
}
