import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IContentService } from '../../domain/interfaces/content-service.interface';
import type { IJobConcurrencyLimiterService } from '../../domain/interfaces/job-concurrency-limiter.service.interface';
import type { ITempFileService } from '../../domain/interfaces/temp-file.service.interface';
import { formatProcessingError } from '../utils/format-processing-error';
import { BuildReelAiMetadataUseCase } from './build-reel-ai-metadata.use-case';
import {
  PrepareReelMediaError,
  PrepareReelMediaUseCase,
} from './prepare-reel-media.use-case';

@Injectable()
export class ProcessReelUseCase {
  private readonly logger = new Logger(ProcessReelUseCase.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prepareReelMediaUseCase: PrepareReelMediaUseCase,
    private readonly buildReelAiMetadataUseCase: BuildReelAiMetadataUseCase,
    @Inject('IContentService')
    private readonly contentService: IContentService,
    @Inject('ITempFileService')
    private readonly tempFileService: ITempFileService,
    @Inject('IJobConcurrencyLimiterService')
    private readonly jobConcurrencyLimiter: IJobConcurrencyLimiterService,
  ) {}

  async execute(data: {
    reelId: string;
    mediaKey: string;
    userId: string;
    processingAttemptId?: string;
    title?: string;
    description?: string;
    tags?: string[];
  }): Promise<void> {
    const concurrency = this.getConcurrencyLimit();

    await this.jobConcurrencyLimiter.runExclusive(async () => {
      const { reelId, mediaKey, processingAttemptId } = data;

      if (!processingAttemptId) {
        this.logger.warn(
          `[Reel ${reelId}] Ignoring processing job without processingAttemptId`,
        );
        return;
      }

      const claimed = await this.contentService.claimReelProcessingAttempt({
        reelId,
        processingAttemptId,
      });

      if (!claimed) {
        this.logger.warn(
          `[Reel ${reelId}] Ignoring duplicate or stale processing attempt ${processingAttemptId}`,
        );
        return;
      }

      this.logger.log(
        `[Reel ${reelId}] Claimed processing attempt ${processingAttemptId} for ${mediaKey}`,
      );

      const workspace = this.tempFileService.createReelProcessingWorkspace();

      let currentProgress = 10;
      let failedStage = 'FAILED';
      let failedMessage = 'Video processing failed';
      let failureDetail = '';

      try {
        const mediaResult = await this.prepareReelMediaUseCase.execute({
          reelId,
          mediaKey,
          processingAttemptId,
          inputPath: workspace.inputPath,
          hlsOutputDir: workspace.hlsOutputDir,
          thumbnailPath: workspace.thumbnailPath,
        });

        currentProgress = 90;

        await this.emitProgress({
          reelId,
          processingAttemptId,
          stage: 'AI_ENRICHMENT',
          message: 'Indexing reel for AI search',
          progress: currentProgress,
        });

        const {
          title,
          description,
          tags,
          transcript,
          transcriptVtt,
          transcriptSegments,
          chunks,
        } = await this.buildReelAiMetadataUseCase.execute({
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
          processingAttemptId,
          title,
          description,
          tags,
          transcript,
          transcriptVtt,
          transcriptSegments,
          chunks,
          thumbnailKey: mediaResult.thumbnailKey,
          stage: 'READY',
          message: 'Video is ready to watch',
          progress: 100,
        });

        this.logger.log(
          `[Reel ${reelId}] Processing attempt ${processingAttemptId} completed successfully`,
        );
      } catch (error: unknown) {
        const { message, stack } = formatProcessingError(error);

        failureDetail = message;

        this.logger.error(
          `[Reel ${reelId}] Processing attempt ${processingAttemptId} failed: ${message}`,
          stack,
        );

        if (error instanceof PrepareReelMediaError) {
          currentProgress = error.progress;
          failedStage = error.stage;
          failedMessage = error.publicMessage;
          failureDetail = error.message;
        }

        await this.emitFailed({
          reelId,
          processingAttemptId,
          progress: currentProgress,
          stage: failedStage,
          message: failedMessage,
          errorCode: failedStage,
          errorDetail: failureDetail,
        });
      } finally {
        this.tempFileService.removeDirIfExists(workspace.workDir);
      }
    }, concurrency);
  }

  private getConcurrencyLimit(): number {
    const rawValue =
      this.configService.get<string>('REEL_VIDEO_PROCESSING_CONCURRENCY') ??
      this.configService.get<string>('MEDIA_VIDEO_PROCESSING_CONCURRENCY') ??
      '1';
    const parsed = Number(rawValue);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  private async emitProgress(data: {
    reelId: string;
    processingAttemptId: string;
    stage: string;
    message: string;
    progress: number;
  }): Promise<void> {
    try {
      await this.contentService.emitProcessingProgress({
        reelId: data.reelId,
        status: 'PROCESSING',
        processingAttemptId: data.processingAttemptId,
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
    processingAttemptId: string;
    progress: number;
    stage: string;
    message: string;
    errorCode: string;
    errorDetail: string;
  }): Promise<void> {
    try {
      await this.contentService.emitProcessingFailed({
        reelId: data.reelId,
        status: 'FAILED',
        processingAttemptId: data.processingAttemptId,
        stage: data.stage,
        message: data.message,
        progress: data.progress,
        errorCode: data.errorCode,
        errorDetail: data.errorDetail,
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
