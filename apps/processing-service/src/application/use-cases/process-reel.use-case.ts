import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { IContentService } from '../../domain/interfaces/content-service.interface';
import { formatProcessingError } from '../services/processing-error-formatter.service';
import { ReelAiMetadataService } from '../services/reel-ai-metadata.service';
import {
  ReelMediaPipelineError,
  ReelMediaPipelineService,
} from '../services/reel-media-pipeline.service';

@Injectable()
export class ProcessReelUseCase {
  private readonly logger = new Logger(ProcessReelUseCase.name);

  constructor(
    private readonly reelMediaPipelineService: ReelMediaPipelineService,
    private readonly reelAiMetadataService: ReelAiMetadataService,
    @Inject('IContentService')
    private readonly contentService: IContentService,
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

    const workDir = path.join('/tmp', crypto.randomUUID());
    const inputPath = path.join(workDir, 'input.mp4');
    const hlsOutputDir = path.join(workDir, 'hls');
    const audioPath = path.join(workDir, 'audio.wav');
    const thumbnailPath = path.join(workDir, 'thumbnail.jpg');

    let currentProgress = 10;

    try {
      const mediaResult = await this.reelMediaPipelineService.prepare({
        reelId,
        mediaKey,
        inputPath,
        hlsOutputDir,
        thumbnailPath,
      });

      currentProgress = 90;

      await this.emitProgress({
        reelId,
        stage: 'AI_ENRICHMENT',
        message: 'Indexing reel for AI search',
        progress: currentProgress,
      });

      const { transcript, transcriptVtt, transcriptSegments, chunks } =
        await this.reelAiMetadataService.build({
          reelId,
          title: data.title,
          description: data.description,
          tags: data.tags,
          inputPath,
          audioPath,
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

      if (error instanceof ReelMediaPipelineError) {
        currentProgress = error.progress;
      }

      await this.emitFailed({
        reelId,
        progress: currentProgress,
      });
    } finally {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
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
