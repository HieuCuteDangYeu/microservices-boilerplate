import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { IndexCheckpointStage } from '@indexing/domain/entities/index-checkpoint.entity';
import type { IIndexingContentService } from '@indexing/domain/interfaces/content-service.interface';
import type { IIndexCheckpointRepository } from '@indexing/domain/interfaces/index-checkpoint.repository.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BuildAndEmbedChunksUseCase } from './build-and-embed-chunks.use-case';
import { BuildTranscriptSectionsUseCase } from './build-transcript-sections.use-case';
import { ExtractHierarchicalMetadataUseCase } from './extract-hierarchical-metadata.use-case';
import { MergeTranscriptSegmentsUseCase } from './merge-transcript-segments.use-case';
import { TranscribeAudioManifestUseCase } from './transcribe-audio-manifest.use-case';

export type ProcessReelIndexJobResult =
  | { status: 'COMPLETED' | 'DUPLICATE' | 'STALE' }
  | { status: 'RETRY' | 'PERMANENT_FAILURE'; error: string };

@Injectable()
export class ProcessReelIndexJobUseCase {
  private readonly logger = new Logger(ProcessReelIndexJobUseCase.name);

  constructor(
    private readonly transcribeAudio: TranscribeAudioManifestUseCase,
    private readonly mergeTranscript: MergeTranscriptSegmentsUseCase,
    private readonly buildSections: BuildTranscriptSectionsUseCase,
    private readonly extractMetadata: ExtractHierarchicalMetadataUseCase,
    private readonly buildAndEmbedChunks: BuildAndEmbedChunksUseCase,
    @Inject('IIndexCheckpointRepository')
    private readonly checkpoints: IIndexCheckpointRepository,
    @Inject('IIndexingContentService')
    private readonly content: IIndexingContentService,
  ) {}

  async execute(input: {
    job: ReelIndexJob;
    allowReclaim: boolean;
    allowRetry: boolean;
  }): Promise<ProcessReelIndexJobResult> {
    const { job } = input;
    try {
      const existing = await this.checkpoints.get(job.indexAttemptId);
      if (existing?.status === 'COMPLETED') return { status: 'DUPLICATE' };

      const claimed = await this.content.claimIndexingAttempt({
        reelId: job.reelId,
        indexAttemptId: job.indexAttemptId,
        allowReclaim: input.allowReclaim || existing !== null,
      });
      if (!claimed) return { status: 'STALE' };

      let checkpoint = await this.checkpoints.startOrResume(job);
      await this.stage(job, 'TRANSCRIBING_AUDIO_SEGMENTS', 10);
      const transcription = await this.transcribeAudio.execute(job);

      if (!checkpoint.mergedTranscript && !checkpoint.mergedSegments) {
        await this.stage(job, 'MERGING_TRANSCRIPT', 35);
        const merged = this.mergeTranscript.execute(
          transcription.segments,
          transcription.manifest?.artifacts.length ?? 0,
        );
        await this.checkpoints.setStage(
          job.indexAttemptId,
          'MERGING_TRANSCRIPT',
          {
            mergedTranscript: merged.text,
            mergedSegments: merged.segments,
          },
        );
        checkpoint =
          (await this.checkpoints.get(job.indexAttemptId)) ?? checkpoint;
      }

      let sections = checkpoint.sections;
      let metadata = checkpoint.extractedMetadata;
      if (!metadata) {
        await this.stage(job, 'EXTRACTING_METADATA', 50);
        sections ??= this.buildSections.execute(
          checkpoint.mergedTranscript,
          checkpoint.mergedSegments,
        );
        const extracted = await this.extractMetadata.execute(
          job,
          checkpoint.mergedTranscript,
          sections,
        );
        metadata = extracted.metadata;
        sections = extracted.sections;
        await this.checkpoints.setStage(
          job.indexAttemptId,
          'EXTRACTING_METADATA',
          {
            extractedMetadata: metadata,
            sections,
          },
        );
      }

      if (!sections) {
        sections = this.buildSections.execute(
          checkpoint.mergedTranscript,
          checkpoint.mergedSegments,
        );
      }
      await this.stage(job, 'BUILDING_SECTIONS', 60);
      await this.checkpoints.setStage(job.indexAttemptId, 'BUILDING_SECTIONS', {
        sections,
      });

      let chunks = checkpoint.chunks;
      if (!chunks) {
        await this.stage(job, 'BUILDING_CHUNKS', 70);
        await this.stage(job, 'EMBEDDING', 75);
        chunks = await this.buildAndEmbedChunks.execute({
          transcript: checkpoint.mergedTranscript,
          transcriptSegments: checkpoint.mergedSegments,
          metadata,
        });
        await this.checkpoints.setStage(job.indexAttemptId, 'EMBEDDING', {
          chunks,
        });
      }

      await this.stage(job, 'VALIDATING', 90);
      this.validate(metadata, chunks);
      await this.stage(job, 'PERSISTING', 95);
      const applied = await this.content.completeIndexing({
        reelId: job.reelId,
        indexAttemptId: job.indexAttemptId,
        transcript: checkpoint.mergedTranscript,
        transcriptSegments: checkpoint.mergedSegments,
        metadata,
        chunks,
      });
      if (!applied) return { status: 'STALE' };

      await this.checkpoints.complete(job.indexAttemptId);
      return { status: 'COMPLETED' };
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Index job ${job.jobId} failed: ${detail}`);
      await this.checkpoints
        .fail(job.indexAttemptId, detail)
        .catch(() => undefined);

      if (input.allowRetry) return { status: 'RETRY', error: detail };

      await this.content
        .failIndexing({
          reelId: job.reelId,
          indexAttemptId: job.indexAttemptId,
          errorDetail: detail,
        })
        .catch(() => undefined);
      return { status: 'PERMANENT_FAILURE', error: detail };
    }
  }

  private async stage(
    job: ReelIndexJob,
    stage: IndexCheckpointStage,
    progress: number,
  ): Promise<void> {
    await this.checkpoints.setStage(job.indexAttemptId, stage);
    await this.content.reportProgress({
      reelId: job.reelId,
      indexAttemptId: job.indexAttemptId,
      stage,
      progress,
    });
  }

  private validate(
    metadata: { title?: string; description?: string; tags: string[] },
    chunks: Array<{ text: string; embedding: number[] }>,
  ): void {
    const hasMetadata = Boolean(
      metadata.title?.trim() ||
      metadata.description?.trim() ||
      metadata.tags.length,
    );
    if (!hasMetadata && chunks.length === 0) {
      throw new Error('Index output has no searchable content');
    }
    for (const chunk of chunks) {
      if (!chunk.text.trim() || chunk.embedding.length === 0) {
        throw new Error('Index output contains an invalid chunk');
      }
    }
  }
}
