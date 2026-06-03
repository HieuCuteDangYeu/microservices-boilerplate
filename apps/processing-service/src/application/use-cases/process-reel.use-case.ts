import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IContentService } from '../../domain/interfaces/content-service.interface';
import type { ITempFileService } from '../../domain/interfaces/temp-file.service.interface';
import { BuildReelAiMetadataUseCase } from './build-reel-ai-metadata.use-case';
import { formatProcessingError } from './format-processing-error';
import {
  PrepareReelMediaError,
  PrepareReelMediaUseCase,
} from './prepare-reel-media.use-case';

@Injectable()
export class ProcessReelUseCase {
  private readonly logger = new Logger(ProcessReelUseCase.name);

  constructor(
    private readonly prepareReelMediaUseCase: PrepareReelMediaUseCase,
    private readonly buildReelAiMetadataUseCase: BuildReelAiMetadataUseCase,
    @Inject('IContentService')
    private readonly contentService: IContentService,
    @Inject('ITempFileService')
    private readonly tempFileService: ITempFileService,
  ) {}

  async execute(data: {
    reelId: string;
    mediaKey: string;
    userId: string;
    title?: string;
    description?: string;
    tags?: string[];
  }): Promise<void> {
    const { reelId, mediaKey } = data;

    this.logger.log(`[Reel ${reelId}] Received processing job for ${mediaKey}`);

    const workspace = this.tempFileService.createReelProcessingWorkspace();

    let currentProgress = 10;

    try {
      const mediaResult = await this.prepareReelMediaUseCase.execute({
        reelId,
        mediaKey,
        inputPath: workspace.inputPath,
        hlsOutputDir: workspace.hlsOutputDir,
        thumbnailPath: workspace.thumbnailPath,
      });

      currentProgress = 90;

      await this.emitProgress({
        reelId,
        stage: 'AI_ENRICHMENT',
        message: 'Indexing reel for AI search',
        progress: currentProgress,
      });

      const { transcript, transcriptVtt, transcriptSegments, chunks } =
        await this.buildReelAiMetadataUseCase.execute({
          reelId,
          title: data.title,
          description: data.description,
          tags: data.tags,
          inputPath: workspace.inputPath,
          audioPath: workspace.audioPath,
        });

      await this.contentService.emitProcessingCompleted({
        reelId,
        status: 'COMPLETED',
        transcript,
        transcriptVtt,
        transcriptSegments,
        chunks,
        thumbnailKey: mediaResult.thumbnailKey,
        stage: 'READY',
        message: 'Video is ready to watch',
        progress: 100,
      });

      this.logger.log(`[Reel ${reelId}] Processing completed successfully`);
    } catch (error: unknown) {
      const { message, stack } = formatProcessingError(error);

      this.logger.error(
        `[Reel ${reelId}] Processing failed: ${message}`,
        stack,
      );

      if (error instanceof PrepareReelMediaError) {
        currentProgress = error.progress;
      }

      await this.emitFailed({
        reelId,
        progress: currentProgress,
      });
    } finally {
      this.tempFileService.removeDirIfExists(workspace.workDir);
    }
  }

  private async emitProgress(data: {
    reelId: string;
    stage: string;
    message: string;
    progress: number;
  }): Promise<void> {
    try {
      await this.contentService.emitProcessingProgress({
        reelId: data.reelId,
        status: 'PROCESSING',
        stage: data.stage,
        message: data.message,
        progress: data.progress,
      });
    } catch (error: unknown) {
      const { message, stack } = formatProcessingError(error);

      this.logger.warn(
        `[Reel ${data.reelId}] Failed to publish processing progress: ${message}`,
        stack,
      );
    }
  }

  private async emitFailed(data: {
    reelId: string;
    progress: number;
  }): Promise<void> {
    try {
      await this.contentService.emitProcessingFailed({
        reelId: data.reelId,
        status: 'FAILED',
        stage: 'FAILED',
        message: 'Video processing failed',
        progress: data.progress,
      });
    } catch (error: unknown) {
      const { message, stack } = formatProcessingError(error);

      this.logger.error(
        `[Reel ${data.reelId}] Failed to emit reel.processing_failed: ${message}`,
        stack,
      );
    }
  }
}
