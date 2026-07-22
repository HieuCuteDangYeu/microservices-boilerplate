import { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { ReelPipelineMetricContext } from '@common/processing/interfaces/reel-pipeline-metric.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  IReelIndexingWorkflow,
  ReelIndexingWorkflowTraceStep,
} from '../../domain/interfaces/reel-indexing-workflow.interface';

@Injectable()
export class BuildReelAiMetadataUseCase {
  private readonly logger = new Logger(BuildReelAiMetadataUseCase.name);

  constructor(
    @Inject('IReelIndexingWorkflow')
    private readonly reelIndexingWorkflow: IReelIndexingWorkflow,
  ) {}

  async execute(data: {
    reelId: string;
    title?: string;
    description?: string;
    tags?: string[];
    inputPath: string;
    audioPath: string;
    metricsContext: ReelPipelineMetricContext;
  }): Promise<{
    title?: string;
    description?: string;
    tags?: string[];
    transcript?: string;
    transcriptVtt?: string;
    transcriptSegments?: TranscriptionResult['segments'];
    chunks?: ReelChunkIndexInput[];
  }> {
    const result = await this.reelIndexingWorkflow.execute(data);

    this.logTrace(data.reelId, result.trace, result.nodeTimings);

    return {
      title: result.title,
      description: result.description,
      tags: result.tags,
      transcript: result.transcript,
      transcriptVtt: result.transcriptVtt,
      transcriptSegments: result.transcriptSegments,
      chunks: result.chunks,
    };
  }

  private logTrace(
    reelId: string,
    trace: ReelIndexingWorkflowTraceStep[],
    nodeTimings: Record<string, number>,
  ): void {
    const traceSummary = trace
      .map((step) => `${step.node}:${step.status}`)
      .join(' -> ');

    this.logger.log(
      `[Reel ${reelId}] Indexing workflow trace: ${traceSummary}`,
    );

    this.logger.debug(
      `[Reel ${reelId}] Indexing workflow timings: ${JSON.stringify(
        nodeTimings,
      )}`,
    );
  }
}
