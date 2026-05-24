import { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';
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
  private readonly defaultTags: string[] = [];

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

  constructor(
    private readonly r2Service: R2Service,
    private readonly ffmpegService: FfmpegService,
    @Inject('IAiService') private readonly aiService: IAiService,
    @Inject('IContentService') private readonly contentService: IContentService,
  ) {}

  private buildEmbeddingDocument(
    data: {
      title?: string;
      description?: string;
      tags?: string[];
    },
    transcript?: string,
  ): { text: string; title?: string } | null {
    const title = data.title?.trim() || undefined;
    const description = data.description?.trim() || undefined;
    const tags = (data.tags ?? this.defaultTags).filter(
      (tag) => tag.trim().length > 0,
    );
    const transcriptText = transcript?.trim() || undefined;

    const sections = [
      title ? `Title: ${title}` : undefined,
      description ? `Description: ${description}` : undefined,
      tags.length > 0 ? `Tags: ${tags.join(', ')}` : undefined,
      transcriptText ? `Transcript:\n${transcriptText}` : undefined,
    ].filter((value): value is string => Boolean(value));

    if (sections.length === 0) {
      return null;
    }

    return {
      text: sections.join('\n\n'),
      title,
    };
  }

  private buildTranscriptionPrompt(data: {
    title?: string;
    tags?: string[];
  }): string | undefined {
    const title = data.title?.trim();
    const tags = (data.tags ?? this.defaultTags)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const hints = [
      title ? `Video title: ${title}` : undefined,
      tags.length > 0 ? `Important terms: ${tags.join(', ')}` : undefined,
      'Transcribe only spoken words in the original language.',
    ].filter((value): value is string => Boolean(value));

    return hints.length > 1 ? hints.join('\n') : undefined;
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
      const { message, stack } = this.describeError(error);
      this.logger.warn(
        `[Reel ${data.reelId}] Failed to publish processing progress: ${message}`,
        stack,
      );
    }
  }

  private async buildAiMetadata(
    data: {
      reelId: string;
      title?: string;
      description?: string;
      tags?: string[];
    },
    inputPath: string,
    audioPath: string,
  ): Promise<{
    transcript?: string;
    transcriptVtt?: string;
    transcriptSegments?: TranscriptionResult['segments'];
    embedding?: number[];
  }> {
    let transcription: TranscriptionResult | undefined;

    try {
      await this.ffmpegService.extractAudio(inputPath, audioPath);
      const audioBuffer = fs.readFileSync(audioPath);

      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }

      transcription = await this.aiService.transcribeAudio(audioBuffer, {
        initialPrompt: this.buildTranscriptionPrompt(data),
      });
      this.logger.log(`[Reel ${data.reelId}] Audio transcription completed`);
    } catch (error: unknown) {
      const { message, stack } = this.describeError(error);
      this.logger.warn(
        `[Reel ${data.reelId}] Audio transcription failed, continuing with metadata-only indexing if available: ${message}`,
        stack,
      );
    } finally {
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }
    }

    const transcript = transcription?.text?.trim() || undefined;
    const transcriptVtt = transcription?.vtt?.trim() || undefined;
    const transcriptSegments =
      transcription?.segments && transcription.segments.length > 0
        ? transcription.segments
        : undefined;

    const embeddingDocument = this.buildEmbeddingDocument(data, transcript);
    if (!embeddingDocument) {
      return transcript
        ? { transcript, transcriptVtt, transcriptSegments }
        : {};
    }

    try {
      const embedding = await this.aiService.generateEmbedding({
        text: embeddingDocument.text,
        taskType: 'RETRIEVAL_DOCUMENT',
        title: embeddingDocument.title,
      });
      return { transcript, transcriptVtt, transcriptSegments, embedding };
    } catch (error: unknown) {
      const { message, stack } = this.describeError(error);
      this.logger.warn(
        `[Reel ${data.reelId}] Embedding generation failed, continuing without embedding: ${message}`,
        stack,
      );
      return transcript
        ? { transcript, transcriptVtt, transcriptSegments }
        : {};
    }
  }

  async execute(data: {
    reelId: string;
    mediaKey: string;
    userId: string;
    title?: string;
    description?: string;
    tags?: string[];
  }) {
    const { reelId, mediaKey } = data;
    this.logger.log(`[Reel ${reelId}] Received processing job for ${mediaKey}`);

    const workDir = path.join('/tmp', crypto.randomUUID());
    const inputPath = path.join(workDir, 'input.mp4');
    const hlsOutputDir = path.join(workDir, 'hls');
    const audioPath = path.join(workDir, 'audio.wav');
    const thumbnailPath = path.join(workDir, 'thumbnail.jpg');

    let thumbnailKey: string | undefined;
    let currentProgress = 10;

    try {
      // Immediately signal PROCESSING so client can show progress
      await this.contentService.emitProcessingStarted({
        reelId,
        status: 'PROCESSING',
        stage: 'DOWNLOADING',
        message: 'Downloading source video',
        progress: currentProgress,
      });

      await this.r2Service.downloadVideo(mediaKey, inputPath);
      this.logger.log(`[Reel ${reelId}] Downloaded source video`);
      currentProgress = 30;
      await this.emitProgress({
        reelId,
        stage: 'TRANSCODING',
        message: 'Transcoding video for streaming',
        progress: currentProgress,
      });

      await this.ffmpegService.transcodeToHls(inputPath, hlsOutputDir);
      this.logger.log(`[Reel ${reelId}] Transcoded to HLS`);

      const s3Prefix = mediaKey.replace(/\.[^.]+$/, '');
      currentProgress = 60;
      await this.emitProgress({
        reelId,
        stage: 'UPLOADING_STREAM',
        message: 'Uploading streaming files',
        progress: currentProgress,
      });
      await this.r2Service.uploadHlsDirectory(hlsOutputDir, s3Prefix);
      this.logger.log(`[Reel ${reelId}] Uploaded HLS files to ${s3Prefix}`);

      // Extract thumbnail at 2s mark
      currentProgress = 75;
      await this.emitProgress({
        reelId,
        stage: 'GENERATING_THUMBNAIL',
        message: 'Generating reel thumbnail',
        progress: currentProgress,
      });
      await this.ffmpegService.extractThumbnail(inputPath, thumbnailPath);
      thumbnailKey = `${s3Prefix}/thumbnail.jpg`;
      await this.r2Service.uploadThumbnail(thumbnailPath, thumbnailKey);
      this.logger.log(`[Reel ${reelId}] Uploaded thumbnail ${thumbnailKey}`);

      // Clean up HLS directory and thumbnail before AI call (free disk)
      fs.rmSync(hlsOutputDir, { recursive: true, force: true });
      if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);

      currentProgress = 90;
      await this.emitProgress({
        reelId,
        stage: 'AI_ENRICHMENT',
        message: 'Indexing reel for AI search',
        progress: currentProgress,
      });

      const { transcript, transcriptVtt, transcriptSegments, embedding } =
        await this.buildAiMetadata(data, inputPath, audioPath);

      await this.contentService.emitProcessingCompleted({
        reelId,
        status: 'COMPLETED',
        transcript,
        transcriptVtt,
        transcriptSegments,
        embedding,
        thumbnailKey,
        stage: 'READY',
        message: 'Video is ready to watch',
        progress: 100,
      });
      this.logger.log(`[Reel ${reelId}] Processing completed successfully`);
    } catch (error: unknown) {
      const { message, stack } = this.describeError(error);
      this.logger.error(
        `[Reel ${reelId}] Processing failed: ${message}`,
        stack,
      );

      try {
        await this.contentService.emitProcessingFailed({
          reelId,
          status: 'FAILED',
          stage: 'FAILED',
          message: 'Video processing failed',
          progress: currentProgress,
        });
      } catch (emitError: unknown) {
        const { message: emitMessage, stack: emitStack } =
          this.describeError(emitError);
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
