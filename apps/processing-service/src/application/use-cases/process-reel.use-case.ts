import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import type { IContentService } from '../../domain/interfaces/content-service.interface';
import { FfmpegService } from '../../infrastructure/services/ffmpeg.service';
import { R2Service } from '../../infrastructure/services/r2.service';

@Injectable()
export class ProcessReelUseCase {
  private readonly logger = new Logger(ProcessReelUseCase.name);

  constructor(
    private readonly r2Service: R2Service,
    private readonly ffmpegService: FfmpegService,
    @Inject('IAiService') private readonly aiService: IAiService,
    @Inject('IContentService') private readonly contentService: IContentService,
  ) {}

  async execute(data: { reelId: string; mediaKey: string; userId: string }) {
    const { reelId, mediaKey } = data;
    this.logger.log(`[Reel ${reelId}] Received processing job for ${mediaKey}`);

    const workDir = path.join('/tmp', crypto.randomUUID());
    const inputPath = path.join(workDir, 'input.mp4');
    const hlsOutputDir = path.join(workDir, 'hls');
    const audioPath = path.join(workDir, 'audio.wav');
    const thumbnailPath = path.join(workDir, 'thumbnail.jpg');

    let thumbnailKey: string | undefined;

    try {
      // Immediately signal PROCESSING so client can show progress
      await this.contentService.emitProcessingStarted({
        reelId,
        status: 'PROCESSING',
      });

      await this.r2Service.downloadVideo(mediaKey, inputPath);
      this.logger.log(`[Reel ${reelId}] Downloaded source video`);

      await this.ffmpegService.transcodeToHls(inputPath, hlsOutputDir);
      this.logger.log(`[Reel ${reelId}] Transcoded to HLS`);

      const s3Prefix = mediaKey.replace(/\.[^.]+$/, '');
      await this.r2Service.uploadHlsDirectory(hlsOutputDir, s3Prefix);
      this.logger.log(`[Reel ${reelId}] Uploaded HLS files to ${s3Prefix}`);

      // Extract thumbnail at 2s mark
      await this.ffmpegService.extractThumbnail(inputPath, thumbnailPath);
      thumbnailKey = `${s3Prefix}/thumbnail.jpg`;
      await this.r2Service.uploadThumbnail(thumbnailPath, thumbnailKey);
      this.logger.log(`[Reel ${reelId}] Uploaded thumbnail ${thumbnailKey}`);

      // Clean up HLS directory and thumbnail before AI call (free disk)
      fs.rmSync(hlsOutputDir, { recursive: true, force: true });
      if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);

      await this.ffmpegService.extractAudio(inputPath, audioPath);
      const audioKey = `${s3Prefix}/audio.wav`;
      await this.r2Service.uploadAudio(audioPath, audioKey);
      this.logger.log(`[Reel ${reelId}] Uploaded audio ${audioKey}`);
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

      const transcriptText = await this.aiService.transcribeAudio(audioKey);
      this.logger.log(`[Reel ${reelId}] Audio transcription completed`);

      const embedding = await this.aiService.generateEmbedding(transcriptText);

      await this.contentService.emitProcessingCompleted({
        reelId,
        status: 'COMPLETED',
        transcript: transcriptText,
        embedding: embedding,
        thumbnailKey,
      });
      this.logger.log(`[Reel ${reelId}] Processing completed successfully`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[Reel ${reelId}] Processing failed: ${message}`,
        stack,
      );

      try {
        await this.contentService.emitProcessingFailed({
          reelId,
          status: 'FAILED',
        });
      } catch (emitError: unknown) {
        const emitMessage =
          emitError instanceof Error ? emitError.message : String(emitError);
        const emitStack =
          emitError instanceof Error ? emitError.stack : undefined;
        this.logger.error(
          `[Reel ${reelId}] Failed to emit reel.processing_failed: ${emitMessage}`,
          emitStack,
        );
      }
    } finally {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    }
  }
}
