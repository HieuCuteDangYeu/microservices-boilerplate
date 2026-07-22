import type { ReelPipelineMetricContext } from '@common/processing/interfaces/reel-pipeline-metric.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IProcessingMetrics } from '@processing/domain/interfaces/processing-metrics.interface';
import type {
  IContentService,
  ReelProcessingMediaMetadata,
} from '../../domain/interfaces/content-service.interface';
import type { IMediaStorageService } from '../../domain/interfaces/media-storage.service.interface';
import type { ITempFileService } from '../../domain/interfaces/temp-file.service.interface';
import type {
  IVideoProcessingService,
  TranscodeToHlsResult,
  VideoMetadata,
} from '../../domain/interfaces/video-processing.service.interface';
import { formatProcessingError } from '../utils/format-processing-error';
import {
  ClassifyReelMediaUseCase,
  ReelMediaClassification,
} from './classify-reel-media.use-case';
import { SelectReelEncodingProfileUseCase } from './select-reel-encoding-profile.use-case';
import {
  ReelSourceMediaValidationError,
  ValidateReelSourceMediaUseCase,
} from './validate-reel-source-media.use-case';
import {
  ReelStreamValidationError,
  ValidateReelStreamUseCase,
} from './validate-reel-stream.use-case';

export class PrepareReelMediaError extends Error {
  readonly stage: string;
  readonly publicMessage: string;
  readonly errorCode: string;
  readonly mediaMetadata?: ReelProcessingMediaMetadata;

  constructor(
    error: unknown,
    readonly progress: number,
    options: {
      stage?: string;
      publicMessage?: string;
      errorCode?: string;
      mediaMetadata?: ReelProcessingMediaMetadata;
    } = {},
  ) {
    const { message, stack } = formatProcessingError(error);

    super(message);
    this.stack = stack;
    this.stage = options.stage ?? 'FAILED';
    this.publicMessage = options.publicMessage ?? 'Video processing failed';
    this.errorCode = options.errorCode ?? this.stage;
    this.mediaMetadata = options.mediaMetadata;
  }
}

@Injectable()
export class PrepareReelMediaUseCase {
  private readonly logger = new Logger(PrepareReelMediaUseCase.name);

  constructor(
    @Inject('IMediaStorageService')
    private readonly mediaStorageService: IMediaStorageService,
    @Inject('IVideoProcessingService')
    private readonly videoProcessingService: IVideoProcessingService,
    @Inject('IContentService')
    private readonly contentService: IContentService,
    @Inject('ITempFileService')
    private readonly tempFileService: ITempFileService,
    @Inject('IProcessingMetrics')
    private readonly processingMetrics: IProcessingMetrics,
    private readonly validateReelStreamUseCase: ValidateReelStreamUseCase,
    private readonly validateReelSourceMediaUseCase: ValidateReelSourceMediaUseCase,
    private readonly selectReelEncodingProfileUseCase: SelectReelEncodingProfileUseCase,
    private readonly classifyReelMediaUseCase: ClassifyReelMediaUseCase,
  ) {}

  async execute(data: {
    reelId: string;
    mediaKey: string;
    processingAttemptId?: string;
    inputPath: string;
    hlsOutputDir: string;
    thumbnailPath: string;
    metricsContext: ReelPipelineMetricContext;
  }): Promise<{
    thumbnailKey: string;
    mediaMetadata: ReelProcessingMediaMetadata;
  }> {
    let currentProgress = 10;
    let currentStage = 'DOWNLOADING';
    let currentPublicMessage = 'Video processing failed';
    let currentErrorCode = 'PROCESSING_FAILED';
    let mediaMetadata: ReelProcessingMediaMetadata | undefined;
    let classification: ReelMediaClassification | undefined;
    const totalMediaTimer = this.processingMetrics.startStage(
      data.metricsContext,
      'TOTAL_MEDIA',
    );

    try {
      await this.contentService.emitProcessingStarted({
        reelId: data.reelId,
        status: 'PROCESSING',
        processingAttemptId: data.processingAttemptId,
        stage: 'DOWNLOADING',
        message: 'Downloading source video',
        progress: currentProgress,
      });

      const downloadTimer = this.processingMetrics.startStage(
        data.metricsContext,
        'SOURCE_DOWNLOAD',
      );

      try {
        await this.mediaStorageService.downloadVideo(
          data.mediaKey,
          data.inputPath,
        );
        const sourceStats = this.tempFileService.getPathStats(data.inputPath);
        downloadTimer.succeed({
          sourceBytes: sourceStats.totalBytes,
          temporaryDiskBytes: sourceStats.totalBytes,
        });
      } catch (error: unknown) {
        downloadTimer.fail(currentStage);
        throw error;
      }

      this.logger.log(`[Reel ${data.reelId}] Downloaded source video`);

      currentProgress = 20;
      currentStage = 'PROBING_SOURCE';
      currentErrorCode = 'SOURCE_PROBE_FAILED';
      currentPublicMessage =
        'This video could not be processed. Please try another video.';

      await this.emitProgress({
        reelId: data.reelId,
        processingAttemptId: data.processingAttemptId,
        stage: currentStage,
        message: 'Checking source video',
        progress: currentProgress,
      });

      const probeTimer = this.processingMetrics.startStage(
        data.metricsContext,
        'FFPROBE',
      );
      let sourceMetadata: VideoMetadata;

      try {
        sourceMetadata = await this.videoProcessingService.getVideoMetadata(
          data.inputPath,
        );
        classification = this.classifyReelMediaUseCase.execute(sourceMetadata);
        data.metricsContext.mediaClass = classification.mediaClass;
        data.metricsContext.orientation = classification.orientation;
        probeTimer.succeed(
          this.toSourceMetricDetails(sourceMetadata, classification),
        );
      } catch (error: unknown) {
        probeTimer.fail(currentStage);
        throw error;
      }

      mediaMetadata = this.toSourceMetadata(sourceMetadata);

      const validationTimer = this.processingMetrics.startStage(
        data.metricsContext,
        'SOURCE_VALIDATION',
      );

      try {
        this.validateReelSourceMediaUseCase.execute(sourceMetadata);
        validationTimer.succeed(
          this.toSourceMetricDetails(sourceMetadata, classification),
        );
      } catch (error: unknown) {
        validationTimer.fail(
          error instanceof ReelSourceMediaValidationError
            ? error.errorCode
            : currentStage,
          this.toSourceMetricDetails(sourceMetadata, classification),
        );
        throw error;
      }

      const profileTimer = this.processingMetrics.startStage(
        data.metricsContext,
        'PROFILE_SELECTION',
      );
      const encodingProfile =
        this.selectReelEncodingProfileUseCase.execute(sourceMetadata);
      profileTimer.succeed({
        profileName: encodingProfile.profileName,
        outputFps: encodingProfile.outputFps,
        hlsSegmentSeconds: encodingProfile.segmentSeconds,
        variantCount: encodingProfile.variants.length,
        variants: encodingProfile.variants.map((variant) => ({
          name: variant.name,
          width: variant.width,
          height: variant.height,
        })),
      });

      this.logger.log(
        `[Reel ${data.reelId}] Selected encoding profile ${encodingProfile.profileName}: fps=${encodingProfile.outputFps}, variants=${encodingProfile.variants
          .map((variant) => variant.name)
          .join(',')}`,
      );

      currentProgress = 35;
      currentStage = 'TRANSCODING';
      currentErrorCode = 'TRANSCODING_FAILED';

      await this.emitProgress({
        reelId: data.reelId,
        processingAttemptId: data.processingAttemptId,
        stage: currentStage,
        message: 'Transcoding video for streaming',
        progress: currentProgress,
      });

      const transcodeTimer = this.processingMetrics.startStage(
        data.metricsContext,
        'FFMPEG_TRANSCODE',
      );
      let transcodeResult: TranscodeToHlsResult;

      try {
        transcodeResult = await this.videoProcessingService.transcodeToHls(
          data.inputPath,
          data.hlsOutputDir,
          encodingProfile,
        );
        const sourceStats = this.tempFileService.getPathStats(data.inputPath);
        const hlsStats = this.tempFileService.getPathStats(data.hlsOutputDir);
        transcodeTimer.succeed({
          ffmpegCpuUsagePercent: null,
          ffmpegCpuMeasurement: 'not_exposed_by_fluent_ffmpeg',
          hlsObjectCount: hlsStats.fileCount,
          hlsTotalBytes: hlsStats.totalBytes,
          temporaryDiskBytes: sourceStats.totalBytes + hlsStats.totalBytes,
          actualVariantDimensions: transcodeResult.variants,
        });
      } catch (error: unknown) {
        transcodeTimer.fail(currentStage, {
          ffmpegCpuUsagePercent: null,
          ffmpegCpuMeasurement: 'not_exposed_by_fluent_ffmpeg',
        });
        throw error;
      }

      mediaMetadata = {
        ...mediaMetadata,
        ...this.toEncodedMetadata(transcodeResult),
      };

      this.logger.log(`[Reel ${data.reelId}] Transcoded to HLS`);

      const s3Prefix = data.mediaKey.replace(/\.[^.]+$/, '');

      currentProgress = 60;
      currentStage = 'UPLOADING_STREAM';
      currentErrorCode = 'STREAM_UPLOAD_FAILED';

      await this.mediaStorageService.deleteObjectsByPrefix(s3Prefix);

      await this.emitProgress({
        reelId: data.reelId,
        processingAttemptId: data.processingAttemptId,
        stage: currentStage,
        message: 'Uploading streaming files',
        progress: currentProgress,
      });

      const hlsStats = this.tempFileService.getPathStats(data.hlsOutputDir);
      const uploadTimer = this.processingMetrics.startStage(
        data.metricsContext,
        'HLS_UPLOAD',
      );

      try {
        await this.mediaStorageService.uploadHlsDirectory(
          data.hlsOutputDir,
          s3Prefix,
        );
        uploadTimer.succeed({
          hlsObjectCount: hlsStats.fileCount,
          hlsTotalBytes: hlsStats.totalBytes,
        });
      } catch (error: unknown) {
        uploadTimer.fail(currentStage, {
          hlsObjectCount: hlsStats.fileCount,
          hlsTotalBytes: hlsStats.totalBytes,
        });
        throw error;
      }

      this.logger.log(
        `[Reel ${data.reelId}] Uploaded HLS files to ${s3Prefix}`,
      );

      currentProgress = 75;
      currentStage = 'GENERATING_THUMBNAIL';
      currentErrorCode = 'THUMBNAIL_FAILED';

      await this.emitProgress({
        reelId: data.reelId,
        processingAttemptId: data.processingAttemptId,
        stage: currentStage,
        message: 'Generating reel thumbnail',
        progress: currentProgress,
      });

      const thumbnailTimer = this.processingMetrics.startStage(
        data.metricsContext,
        'THUMBNAIL',
      );
      const thumbnailKey = `${s3Prefix}/thumbnail.jpg`;

      try {
        await this.videoProcessingService.extractThumbnail(
          data.inputPath,
          data.thumbnailPath,
        );

        await this.mediaStorageService.uploadThumbnail(
          data.thumbnailPath,
          thumbnailKey,
        );
        const thumbnailStats = this.tempFileService.getPathStats(
          data.thumbnailPath,
        );
        thumbnailTimer.succeed({
          thumbnailBytes: thumbnailStats.totalBytes,
        });
      } catch (error: unknown) {
        thumbnailTimer.fail(currentStage);
        throw error;
      }

      this.logger.log(
        `[Reel ${data.reelId}] Uploaded thumbnail ${thumbnailKey}`,
      );

      currentProgress = 85;
      currentStage = 'VALIDATING_STREAM';
      currentErrorCode = 'STREAM_VALIDATION_FAILED';
      currentPublicMessage =
        'Streaming files could not be prepared. Please try again.';

      await this.emitProgress({
        reelId: data.reelId,
        processingAttemptId: data.processingAttemptId,
        stage: currentStage,
        message: 'Checking streaming files',
        progress: currentProgress,
      });

      const streamValidationTimer = this.processingMetrics.startStage(
        data.metricsContext,
        'STREAM_VALIDATION',
      );

      try {
        await this.validateReelStreamUseCase.execute({
          reelId: data.reelId,
          s3Prefix,
          thumbnailKey,
        });
        streamValidationTimer.succeed();
      } catch (error: unknown) {
        streamValidationTimer.fail(currentStage);
        throw error;
      }

      this.tempFileService.removeDirIfExists(data.hlsOutputDir);
      this.tempFileService.removeFileIfExists(data.thumbnailPath);

      totalMediaTimer.succeed({
        ...this.toSourceMetricDetails(sourceMetadata, classification),
        encodedVariantCount: transcodeResult.variantCount,
        actualVariantDimensions: transcodeResult.variants,
      });

      return {
        thumbnailKey,
        mediaMetadata,
      };
    } catch (error: unknown) {
      totalMediaTimer.fail(
        error instanceof ReelSourceMediaValidationError
          ? error.errorCode
          : currentStage,
        {
          ...(mediaMetadata ?? {}),
        },
      );

      if (error instanceof ReelSourceMediaValidationError) {
        throw new PrepareReelMediaError(error, currentProgress, {
          stage: error.errorCode,
          errorCode: error.errorCode,
          publicMessage: error.publicMessage,
          mediaMetadata,
        });
      }

      if (error instanceof ReelStreamValidationError) {
        throw new PrepareReelMediaError(error, currentProgress, {
          stage: 'STREAM_VALIDATION_FAILED',
          errorCode: 'STREAM_VALIDATION_FAILED',
          publicMessage: error.message,
          mediaMetadata,
        });
      }

      throw new PrepareReelMediaError(error, currentProgress, {
        stage: currentStage,
        errorCode: currentErrorCode,
        publicMessage: currentPublicMessage,
        mediaMetadata,
      });
    }
  }

  private toSourceMetadata(
    metadata: VideoMetadata,
  ): ReelProcessingMediaMetadata {
    return {
      sourceDurationMs: metadata.durationMs,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      sourceFps: metadata.fps,
      sourceBitrateKbps: metadata.bitrateKbps,
      sourceHasAudio: metadata.hasAudio,
      sourceRotation: metadata.rotation,
    };
  }

  private toSourceMetricDetails(
    metadata: VideoMetadata,
    classification?: ReelMediaClassification,
  ): Record<string, unknown> {
    return {
      sourceDurationMs: metadata.durationMs,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      sourceFps: metadata.fps,
      sourceBitrateKbps: metadata.bitrateKbps,
      sourceHasAudio: metadata.hasAudio,
      sourceRotation: metadata.rotation ?? 0,
      sourceEffectiveWidth: classification?.effectiveWidth,
      sourceEffectiveHeight: classification?.effectiveHeight,
      sourceAspectRatio: classification?.aspectRatio,
      lengthClassification: classification?.mediaClass ?? 'UNKNOWN',
      orientationClassification: classification?.orientation ?? 'UNKNOWN',
    };
  }

  private toEncodedMetadata(
    result: TranscodeToHlsResult,
  ): ReelProcessingMediaMetadata {
    return {
      encodedVariantCount: result.variantCount,
      encodedMaxHeight: result.maxHeight,
      encodedFps: result.outputFps,
    };
  }

  private async emitProgress(data: {
    reelId: string;
    processingAttemptId?: string;
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
}
