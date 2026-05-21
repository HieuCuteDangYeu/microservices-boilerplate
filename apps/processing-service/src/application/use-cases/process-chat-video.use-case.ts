import type { ProcessVideoThumbnailPayload } from '@common/media/dtos/process-video-thumbnail.dto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IConversationMediaService } from '@processing/domain/interfaces/conversation-media.service.interface';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { FfmpegService } from '../../infrastructure/services/ffmpeg.service';
import { JobConcurrencyLimiterService } from '../../infrastructure/services/job-concurrency-limiter.service';
import { R2Service } from '../../infrastructure/services/r2.service';

@Injectable()
export class ProcessChatVideoUseCase {
  private readonly logger = new Logger(ProcessChatVideoUseCase.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly r2Service: R2Service,
    private readonly ffmpegService: FfmpegService,
    private readonly jobConcurrencyLimiter: JobConcurrencyLimiterService,
    @Inject('IConversationMediaService')
    private readonly conversationMediaService: IConversationMediaService,
  ) {}

  async execute(data: ProcessVideoThumbnailPayload): Promise<void> {
    const concurrency = this.getConcurrencyLimit();

    await this.jobConcurrencyLimiter.runExclusive(async () => {
      const maxAttempts = data.maxAttempts ?? 3;
      let lastError: { message: string; stack?: string } | null = null;

      for (
        let attempt = (data.attempt ?? 0) + 1;
        attempt <= maxAttempts;
        attempt += 1
      ) {
        try {
          await this.processOnce(data);
          return;
        } catch (error: unknown) {
          lastError = this.describeError(error);
          this.logger.warn(
            `[ChatMedia ${data.fileKey}] attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`,
          );

          if (attempt >= maxAttempts) {
            break;
          }

          await this.sleep(Math.min(1000 * attempt, 3000));
        }
      }

      await this.conversationMediaService.emitMediaProcessingFailed({
        userId: data.userId,
        fileKey: data.fileKey,
        media: {
          fileKey: data.fileKey,
          fileUrl: this.r2Service.getPublicUrl(data.fileKey),
          mimeType: data.fileType,
          status: 'failed',
          failureReason:
            lastError?.message ?? 'Video processing failed unexpectedly.',
        },
      });

      this.logger.error(
        `[ChatMedia ${data.fileKey}] processing failed after ${
          data.maxAttempts ?? 3
        } attempts`,
        lastError?.stack,
      );
    }, concurrency);
  }

  private async processOnce(data: ProcessVideoThumbnailPayload): Promise<void> {
    const workDir = path.join('/tmp', `chat-media-${crypto.randomUUID()}`);
    const inputPath = path.join(workDir, 'input-video');
    const thumbnailPath = path.join(workDir, 'thumbnail.jpg');

    try {
      fs.mkdirSync(workDir, { recursive: true });

      await this.r2Service.downloadVideo(data.fileKey, inputPath);
      const metadata = await this.ffmpegService.getVideoMetadata(inputPath);
      const thumbnailKey =
        data.thumbnailKey ?? this.buildThumbnailKey(data.fileKey);
      const thumbnailTimestamp = this.resolveThumbnailTimestamp(
        metadata.durationMs,
      );
      await this.ffmpegService.extractThumbnail(
        inputPath,
        thumbnailPath,
        thumbnailTimestamp,
      );

      const uploadedThumbnail = await this.r2Service.uploadThumbnail(
        thumbnailPath,
        thumbnailKey,
      );

      await this.conversationMediaService.emitMediaProcessingCompleted({
        userId: data.userId,
        fileKey: data.fileKey,
        media: {
          fileKey: data.fileKey,
          fileUrl: this.r2Service.getPublicUrl(data.fileKey),
          mimeType: data.fileType,
          status: 'ready',
          thumbnailKey: uploadedThumbnail.key,
          thumbnailUrl: uploadedThumbnail.url,
          ...metadata,
        },
      });

      this.logger.log(
        `[ChatMedia ${data.fileKey}] processing completed successfully`,
      );
    } finally {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    }
  }

  private getConcurrencyLimit(): number {
    const rawValue =
      this.configService.get<string>('MEDIA_VIDEO_PROCESSING_CONCURRENCY') ??
      '3';
    const parsed = Number(rawValue);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }

  private buildThumbnailKey(fileKey: string): string {
    const normalizedKey = fileKey.replace(/^\/+/, '');
    const keyParts = normalizedKey.split('/');
    const fileName = keyParts.pop() ?? crypto.randomUUID();
    const userFolder = keyParts[1] ?? 'unknown';
    const baseName = fileName.replace(/\.[^.]+$/, '');

    return `chat-thumbnails/${userFolder}/${baseName}.jpg`;
  }

  private resolveThumbnailTimestamp(durationMs?: number): string {
    if (!durationMs || durationMs <= 0) {
      return '00:00:01.200';
    }

    const safeUpperBoundMs = Math.max(Math.min(durationMs - 120, 3000), 120);
    const preferredCaptureMs =
      durationMs < 2000
        ? Math.round(durationMs * 0.25)
        : Math.round(durationMs * 0.18);
    const captureMs = Math.min(
      Math.max(preferredCaptureMs, 120),
      safeUpperBoundMs,
    );

    const hours = Math.floor(captureMs / 3_600_000);
    const minutes = Math.floor((captureMs % 3_600_000) / 60_000);
    const seconds = Math.floor((captureMs % 60_000) / 1000);
    const milliseconds = captureMs % 1000;

    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  private describeError(error: unknown): {
    message: string;
    stack?: string;
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
      };
    }

    if (typeof error === 'object' && error !== null) {
      const record = error as Record<string, unknown>;
      const message =
        typeof record['message'] === 'string'
          ? record['message']
          : JSON.stringify(error);
      const stack =
        typeof record['stack'] === 'string' ? record['stack'] : undefined;

      return { message, stack };
    }

    return {
      message: String(error),
    };
  }

  private async sleep(delayMs: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
