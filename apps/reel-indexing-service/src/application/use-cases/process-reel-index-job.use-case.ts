import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type { ReelIndexDocument } from '@common/processing/interfaces/reel-index-document.interface';
import type { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { IndexCheckpointStage } from '@indexing/domain/entities/index-checkpoint.entity';
import type { IIndexingContentService } from '@indexing/domain/interfaces/content-service.interface';
import type { IIndexCheckpointRepository } from '@indexing/domain/interfaces/index-checkpoint.repository.interface';
import type { ISemanticIndexRepository } from '@indexing/domain/interfaces/semantic-index.repository.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BuildHierarchicalIndexUseCase } from './build-hierarchical-index.use-case';
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
    private readonly buildHierarchicalIndex: BuildHierarchicalIndexUseCase,
    @Inject('IIndexCheckpointRepository')
    private readonly checkpoints: IIndexCheckpointRepository,
    @Inject('IIndexingContentService')
    private readonly content: IIndexingContentService,
    @Inject('ISemanticIndexRepository')
    private readonly semanticIndex: ISemanticIndexRepository,
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

      const resumingPersistence = existing?.stage === 'PERSISTING';
      const claimed = resumingPersistence
        ? true
        : await this.content.claimIndexingAttempt({
            reelId: job.reelId,
            indexAttemptId: job.indexAttemptId,
            allowReclaim: input.allowReclaim || existing !== null,
          });
      if (!claimed) return { status: 'STALE' };

      let checkpoint = await this.checkpoints.startOrResume(job);
      if (resumingPersistence) {
        if (!checkpoint.extractedMetadata || !checkpoint.sections) {
          throw new Error('Persisting checkpoint is missing semantic inputs');
        }
        const { chunks, documents } = await this.buildHierarchicalIndex.execute(
          {
            job,
            transcript: checkpoint.mergedTranscript,
            transcriptSegments: checkpoint.mergedSegments,
            metadata: checkpoint.extractedMetadata,
            sections: checkpoint.sections,
          },
        );
        this.validate(job, checkpoint.extractedMetadata, chunks, documents);
        return await this.persistCompletion({
          job,
          transcript: checkpoint.mergedTranscript,
          transcriptSegments: checkpoint.mergedSegments,
          metadata: checkpoint.extractedMetadata,
          chunks,
          documents,
        });
      }

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

      await this.stage(job, 'BUILDING_CHUNKS', 70);
      await this.stage(job, 'EMBEDDING', 75);
      const { chunks, documents } = await this.buildHierarchicalIndex.execute({
        job,
        transcript: checkpoint.mergedTranscript,
        transcriptSegments: checkpoint.mergedSegments,
        metadata,
        sections,
      });

      await this.stage(job, 'VALIDATING', 90);
      this.validate(job, metadata, chunks, documents);
      await this.stage(job, 'PERSISTING', 95);
      return await this.persistCompletion({
        job,
        transcript: checkpoint.mergedTranscript,
        transcriptSegments: checkpoint.mergedSegments,
        metadata,
        chunks,
        documents,
      });
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

  private async persistCompletion(input: {
    job: ReelIndexJob;
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    metadata: { title?: string; description?: string; tags: string[] };
    chunks: ReelChunkIndexInput[];
    documents: ReelIndexDocument[];
  }): Promise<ProcessReelIndexJobResult> {
    const { job } = input;
    await this.semanticIndex.persistCandidate({
      job,
      metadata: input.metadata,
      transcriptSegments: input.transcriptSegments,
      documents: input.documents,
    });
    const applied = await this.content.completeIndexing({
      reelId: job.reelId,
      indexAttemptId: job.indexAttemptId,
      transcript: input.transcript,
      transcriptSegments: input.transcriptSegments,
      metadata: input.metadata,
      chunks: input.chunks,
    });
    if (!applied) {
      await this.semanticIndex.discardCandidate(job.reelId, job.indexAttemptId);
      return { status: 'STALE' };
    }

    await this.semanticIndex.activateCandidate(job.reelId, job.indexAttemptId);
    return { status: 'COMPLETED' };
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
    job: ReelIndexJob,
    metadata: { title?: string; description?: string; tags: string[] },
    chunks: ReelChunkIndexInput[],
    documents: ReelIndexDocument[],
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
    if (documents.filter((document) => document.kind === 'REEL').length !== 1) {
      throw new Error('Index output must contain exactly one Reel document');
    }
    if (
      job.sourceLengthClass === 'LONG' &&
      chunks.some((chunk) => chunk.startTime !== undefined) &&
      documents.every((document) => document.kind !== 'SECTION')
    ) {
      throw new Error('Long index output has no section documents');
    }
  }
}
