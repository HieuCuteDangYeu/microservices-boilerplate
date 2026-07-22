import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { ReelPipelineMetricContext } from '@common/processing/interfaces/reel-pipeline-metric.interface';

export interface ReelIndexingWorkflowInput {
  reelId: string;
  title?: string;
  description?: string;
  tags?: string[];
  inputPath: string;
  audioPath: string;
  metricsContext: ReelPipelineMetricContext;
}

export interface ReelIndexingWorkflowTraceStep {
  node: string;
  status: 'SUCCESS' | 'FALLBACK' | 'FAILED';
  message?: string;
  durationMs?: number;
}

export interface ReelIndexingWorkflowResult {
  title?: string;
  description?: string;
  tags?: string[];
  transcript?: string;
  transcriptVtt?: string;
  transcriptSegments?: TranscriptSegment[];
  chunks?: ReelChunkIndexInput[];
  trace: ReelIndexingWorkflowTraceStep[];
  nodeTimings: Record<string, number>;
}

export interface IReelIndexingWorkflow {
  execute(
    input: ReelIndexingWorkflowInput,
  ): Promise<ReelIndexingWorkflowResult>;
}
