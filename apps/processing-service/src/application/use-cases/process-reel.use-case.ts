// apps/processing-service/src/application/use-cases/process-reel.use-case.ts

import {
  TranscriptSegment,
  TranscriptionResult,
} from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { IAiService } from '../../domain/interfaces/ai-service.interface';
import type { IContentService } from '../../domain/interfaces/content-service.interface';
import { FfmpegService } from '../../infrastructure/services/ffmpeg.service';
import { R2Service } from '../../infrastructure/services/r2.service';

interface BuiltTranscriptChunk {
  text: string;
  startTime?: number;
  endTime?: number;
}

@Injectable()
export class ProcessReelUseCase {
  private readonly logger = new Logger(ProcessReelUseCase.name);
  private readonly defaultTags: string[] = [];
  private readonly maxChunkChars = 1200;

  constructor(
    private readonly r2Service: R2Service,
    private readonly ffmpegService: FfmpegService,
    @Inject('IAiService') private readonly aiService: IAiService,
    @Inject('IContentService') private readonly contentService: IContentService,
  ) {}

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

  private buildTranscriptionPrompt(data: {
    title?: string;
    tags?: string[];
  }): string | undefined {
    const title = data.title?.trim();

    const tags = (data.tags ?? this.defaultTags)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const hints = [
      'The audio may contain any language or mixed-language speech.',
      'Transcribe the spoken words exactly in the original language.',
      'Do not translate the speech.',
      'Do not rewrite non-English words into similar-sounding English words.',
      'Preserve names, slang, usernames, hashtags, product names, and technical terms as spoken.',
      title ? `Video title/context: ${title}` : undefined,
      tags.length > 0
        ? `Important terms that may appear: ${tags.join(', ')}`
        : undefined,
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

  private buildChunksFromSegments(
    segments?: TranscriptSegment[],
  ): BuiltTranscriptChunk[] {
    if (!Array.isArray(segments) || segments.length === 0) {
      return [];
    }

    const chunks: BuiltTranscriptChunk[] = [];
    let currentTexts: string[] = [];
    let currentStart: number | undefined;
    let currentEnd: number | undefined;
    let currentLength = 0;

    for (const segment of segments) {
      const text = segment.text?.trim();

      if (!text) {
        continue;
      }

      const start = Number(segment.start);
      const end = Number(segment.end);

      const nextLength = currentLength + text.length + 1;

      if (currentTexts.length > 0 && nextLength > this.maxChunkChars) {
        chunks.push({
          text: currentTexts.join(' ').trim(),
          startTime: currentStart,
          endTime: currentEnd,
        });

        const overlap = currentTexts.slice(-1);
        currentTexts = [...overlap];
        currentLength = overlap.join(' ').length;
        currentStart = currentEnd;
      }

      if (currentTexts.length === 0 && Number.isFinite(start)) {
        currentStart = start;
      }

      currentTexts.push(text);
      currentLength += text.length + 1;

      if (Number.isFinite(end)) {
        currentEnd = end;
      }
    }

    if (currentTexts.length > 0) {
      chunks.push({
        text: currentTexts.join(' ').trim(),
        startTime: currentStart,
        endTime: currentEnd,
      });
    }

    return chunks;
  }

  private buildChunksFromTranscript(
    transcript?: string,
  ): BuiltTranscriptChunk[] {
    const text = transcript?.trim();

    if (!text) {
      return [];
    }

    const parts = text
      .split(/(?<=[.!?。！？])\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      return [{ text }];
    }

    const chunks: BuiltTranscriptChunk[] = [];
    let current: string[] = [];
    let currentLength = 0;

    for (const part of parts) {
      const nextLength = currentLength + part.length + 1;

      if (current.length > 0 && nextLength > this.maxChunkChars) {
        chunks.push({ text: current.join(' ').trim() });

        const overlap = current.slice(-1);
        current = [...overlap];
        currentLength = overlap.join(' ').length;
      }

      current.push(part);
      currentLength += part.length + 1;
    }

    if (current.length > 0) {
      chunks.push({ text: current.join(' ').trim() });
    }

    return chunks;
  }

  private buildMetadataOnlyChunk(data: {
    title?: string;
    description?: string;
    tags?: string[];
  }): BuiltTranscriptChunk | null {
    const title = data.title?.trim();
    const description = data.description?.trim();

    const tags = (data.tags ?? this.defaultTags)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const sections = [
      title ? `Title: ${title}` : undefined,
      description ? `Description: ${description}` : undefined,
      tags.length > 0 ? `Tags: ${tags.join(', ')}` : undefined,
    ].filter((value): value is string => Boolean(value));

    if (sections.length === 0) {
      return null;
    }

    return {
      text: sections.join('\n'),
    };
  }

  private buildEmbeddingText(
    data: {
      title?: string;
      description?: string;
      tags?: string[];
    },
    chunkText: string,
  ): { text: string; title?: string } {
    const title = data.title?.trim() || undefined;
    const description = data.description?.trim() || undefined;

    const tags = (data.tags ?? this.defaultTags)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const sections = [
      title ? `Title: ${title}` : undefined,
      description ? `Description: ${description}` : undefined,
      tags.length > 0 ? `Tags: ${tags.join(', ')}` : undefined,
      `Transcript chunk:\n${chunkText.trim()}`,
    ].filter((value): value is string => Boolean(value));

    return {
      text: sections.join('\n\n'),
      title,
    };
  }

  private async buildSearchableChunks(data: {
    reelId: string;
    title?: string;
    description?: string;
    tags?: string[];
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
  }): Promise<ReelChunkIndexInput[]> {
    let builtChunks = this.buildChunksFromSegments(data.transcriptSegments);

    if (builtChunks.length === 0) {
      builtChunks = this.buildChunksFromTranscript(data.transcript);
    }

    if (builtChunks.length === 0) {
      const metadataOnlyChunk = this.buildMetadataOnlyChunk(data);

      if (metadataOnlyChunk) {
        builtChunks = [metadataOnlyChunk];
      }
    }

    const chunks: ReelChunkIndexInput[] = [];

    for (let index = 0; index < builtChunks.length; index++) {
      const chunk = builtChunks[index];
      const embeddingDocument = this.buildEmbeddingText(data, chunk.text);

      try {
        const embedding = await this.aiService.generateEmbedding({
          text: embeddingDocument.text,
          taskType: 'RETRIEVAL_DOCUMENT',
          title: embeddingDocument.title,
        });

        chunks.push({
          chunkIndex: index,
          text: chunk.text,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
          embedding: embedding.values,
          embeddingModel: `${embedding.model}:${embedding.dimensions}`,
        });
      } catch (error: unknown) {
        const { message, stack } = this.describeError(error);

        this.logger.warn(
          `[Reel ${data.reelId}] Failed to embed chunk ${index}: ${message}`,
          stack,
        );
      }
    }

    return chunks;
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
    chunks?: ReelChunkIndexInput[];
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

    const chunks = await this.buildSearchableChunks({
      reelId: data.reelId,
      title: data.title,
      description: data.description,
      tags: data.tags,
      transcript,
      transcriptSegments,
    });

    return {
      transcript,
      transcriptVtt,
      transcriptSegments,
      chunks: chunks.length > 0 ? chunks : undefined,
    };
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

      fs.rmSync(hlsOutputDir, { recursive: true, force: true });

      if (fs.existsSync(thumbnailPath)) {
        fs.unlinkSync(thumbnailPath);
      }

      currentProgress = 90;

      await this.emitProgress({
        reelId,
        stage: 'AI_ENRICHMENT',
        message: 'Indexing reel for AI search',
        progress: currentProgress,
      });

      const { transcript, transcriptVtt, transcriptSegments, chunks } =
        await this.buildAiMetadata(data, inputPath, audioPath);

      await this.contentService.emitProcessingCompleted({
        reelId,
        status: 'COMPLETED',
        transcript,
        transcriptVtt,
        transcriptSegments,
        chunks,
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
