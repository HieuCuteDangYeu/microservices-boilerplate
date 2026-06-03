import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IContentService } from '../../domain/interfaces/content-service.interface';
import type { IMediaStorageService } from '../../domain/interfaces/media-storage.service.interface';
import type { ITempFileService } from '../../domain/interfaces/temp-file.service.interface';
import type { IVideoProcessingService } from '../../domain/interfaces/video-processing.service.interface';
import { formatProcessingError } from './format-processing-error';

export class PrepareReelMediaError extends Error {
  constructor(
    error: unknown,
    readonly progress: number,
  ) {
    const { message, stack } = formatProcessingError(error);

    super(message);
    this.stack = stack;
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
  ) {}

  async execute(data: {
    reelId: string;
    mediaKey: string;
    inputPath: string;
    hlsOutputDir: string;
    thumbnailPath: string;
  }): Promise<{
    thumbnailKey: string;
  }> {
    let currentProgress = 10;

    try {
      await this.contentService.emitProcessingStarted({
        reelId: data.reelId,
        status: 'PROCESSING',
        stage: 'DOWNLOADING',
        message: 'Downloading source video',
        progress: currentProgress,
      });

      await this.mediaStorageService.downloadVideo(
        data.mediaKey,
        data.inputPath,
      );

      this.logger.log(`[Reel ${data.reelId}] Downloaded source video`);

      currentProgress = 30;

      await this.emitProgress({
        reelId: data.reelId,
        stage: 'TRANSCODING',
        message: 'Transcoding video for streaming',
        progress: currentProgress,
      });

      await this.videoProcessingService.transcodeToHls(
        data.inputPath,
        data.hlsOutputDir,
      );

      this.logger.log(`[Reel ${data.reelId}] Transcoded to HLS`);

      const s3Prefix = data.mediaKey.replace(/\.[^.]+$/, '');

      currentProgress = 60;

      await this.emitProgress({
        reelId: data.reelId,
        stage: 'UPLOADING_STREAM',
        message: 'Uploading streaming files',
        progress: currentProgress,
      });

      await this.mediaStorageService.uploadHlsDirectory(
        data.hlsOutputDir,
        s3Prefix,
      );

      this.logger.log(
        `[Reel ${data.reelId}] Uploaded HLS files to ${s3Prefix}`,
      );

      currentProgress = 75;

      await this.emitProgress({
        reelId: data.reelId,
        stage: 'GENERATING_THUMBNAIL',
        message: 'Generating reel thumbnail',
        progress: currentProgress,
      });

      await this.videoProcessingService.extractThumbnail(
        data.inputPath,
        data.thumbnailPath,
      );

      const thumbnailKey = `${s3Prefix}/thumbnail.jpg`;

      await this.mediaStorageService.uploadThumbnail(
        data.thumbnailPath,
        thumbnailKey,
      );

      this.logger.log(
        `[Reel ${data.reelId}] Uploaded thumbnail ${thumbnailKey}`,
      );

      this.tempFileService.removeDirIfExists(data.hlsOutputDir);
      this.tempFileService.removeFileIfExists(data.thumbnailPath);

      return {
        thumbnailKey,
      };
    } catch (error: unknown) {
      throw new PrepareReelMediaError(error, currentProgress);
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
}
