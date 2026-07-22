import type {
  ReelPipelineMetricContext,
  ReelPipelineMetricRecord,
} from '@common/processing/interfaces/reel-pipeline-metric.interface';

export type ProcessingMetricDetails = Record<string, unknown>;

export interface IProcessingStageTimer {
  succeed(details?: ProcessingMetricDetails): number;
  fail(failureStage?: string, details?: ProcessingMetricDetails): number;
}

export interface IProcessingMetrics {
  startStage(
    context: ReelPipelineMetricContext,
    stage: string,
    details?: ProcessingMetricDetails,
  ): IProcessingStageTimer;

  record(
    context: ReelPipelineMetricContext,
    input: {
      stage: string;
      success: boolean;
      durationMs: number;
      retryNumber?: number;
      failureStage?: string;
      details?: ProcessingMetricDetails;
    },
  ): ReelPipelineMetricRecord;

  estimatePayloadBytes(payload: unknown): number;
}
