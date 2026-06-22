import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class UpdateReelStatusUseCase {
  private readonly logger = new Logger(UpdateReelStatusUseCase.name);

  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(
    reelId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    transcriptVtt?: string,
    transcriptSegments?: TranscriptSegment[],
    thumbnailKey?: string,
    processingStage?: string,
    processingMessage?: string,
    processingProgress?: number,
    chunks?: ReelChunkIndexInput[],
    title?: string,
    description?: string,
    tags?: string[],
  ) {
    let sanitizedTranscript = transcript;
    let sanitizedTranscriptVtt = transcriptVtt?.trim() || undefined;
    let sanitizedTranscriptSegments =
      this.normalizeTranscriptSegments(transcriptSegments);
    const sanitizedChunks = this.normalizeChunks(chunks);
    const sanitizedTitle = this.normalizeOptionalText(title, 80);
    const sanitizedDescription = this.normalizeOptionalText(description, 500);
    const sanitizedTags = this.normalizeTags(tags);
    let nextStage = processingStage;
    let nextMessage = processingMessage;
    let nextProgress = this.normalizeProgress(processingProgress);

    if (status === 'COMPLETED') {
      if (!transcript || transcript.trim() === '') {
        sanitizedTranscript = undefined;
        sanitizedTranscriptVtt = undefined;
        sanitizedTranscriptSegments = undefined;

        this.logger.warn(
          `Reel ${reelId}: completing without transcript because transcript is missing or empty`,
        );
      } else {
        const quality = this.validateTranscriptQuality(transcript);

        if (!quality.valid) {
          sanitizedTranscript = undefined;
          sanitizedTranscriptVtt = undefined;
          sanitizedTranscriptSegments = undefined;

          this.logger.warn(
            `Reel ${reelId}: completing without transcript because transcript quality check failed: "${quality.reason}"`,
          );
        }
      }

      if (!sanitizedChunks || sanitizedChunks.length === 0) {
        this.logger.warn(
          `Reel ${reelId}: completing without searchable chunks. RAG will not find this reel until chunks are generated.`,
        );
      }

      nextStage ??= 'READY';
      nextMessage ??= 'Video is ready to watch';
      nextProgress ??= 100;
    }

    if (status === 'PENDING') {
      nextStage ??= 'QUEUED';
      nextMessage ??= 'Queued for processing';
      nextProgress ??= 0;
    }

    if (status === 'PROCESSING') {
      nextStage ??= 'PROCESSING';
      nextMessage ??= 'Video is being processed';
      nextProgress ??= 10;
    }

    if (status === 'FAILED') {
      nextStage ??= 'FAILED';
      nextMessage ??= 'Video processing failed';
    }

    return await this.contentRepository.updateReelStatus(
      reelId,
      status,
      sanitizedTranscript,
      sanitizedTranscriptVtt,
      sanitizedTranscriptSegments,
      thumbnailKey,
      nextStage,
      nextMessage,
      nextProgress,
      sanitizedChunks,
      sanitizedTitle,
      sanitizedDescription,
      sanitizedTags,
    );
  }

  private normalizeProgress(progress?: number): number | undefined {
    if (progress === undefined || !Number.isFinite(progress)) {
      return undefined;
    }

    return Math.min(100, Math.max(0, Math.round(progress)));
  }

  private validateTranscriptQuality(transcript: string): {
    valid: boolean;
    reason?: string;
  } {
    const MIN_LENGTH = 10;
    const trimmed = transcript.trim();

    if (trimmed.length < MIN_LENGTH) {
      return { valid: false, reason: `too short (${trimmed.length} chars)` };
    }

    const placeholderPatterns = [
      /^\[.+\]$/,
      /^(music|sound|noise)+$/i,
      /^(speaking|language|foreign)/i,
      /^(uh+|um+|ah+|er+)+$/i,
    ];

    for (const pattern of placeholderPatterns) {
      if (pattern.test(trimmed)) {
        return {
          valid: false,
          reason: `matches placeholder pattern: "${trimmed}"`,
        };
      }
    }

    const actualWords = trimmed.split(/\s+/).filter((w) => w.length > 1).length;

    if (actualWords < 3) {
      return {
        valid: false,
        reason: `not enough actual words (${actualWords})`,
      };
    }

    return { valid: true };
  }

  private normalizeTranscriptSegments(
    segments?: TranscriptSegment[],
  ): TranscriptSegment[] | undefined {
    if (!Array.isArray(segments)) {
      return undefined;
    }

    const sanitized = segments.flatMap((segment) => {
      if (!segment || typeof segment !== 'object') {
        return [];
      }

      const start = Number(segment.start);
      const end = Number(segment.end);
      const text = typeof segment.text === 'string' ? segment.text.trim() : '';

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        text.length === 0
      ) {
        return [];
      }

      return [
        {
          ...segment,
          start,
          end,
          text,
        },
      ];
    });

    return sanitized.length > 0 ? sanitized : undefined;
  }

  private normalizeChunks(
    chunks?: ReelChunkIndexInput[],
  ): ReelChunkIndexInput[] | undefined {
    if (!Array.isArray(chunks)) {
      return undefined;
    }

    const sanitized = chunks.flatMap((chunk, index) => {
      if (!chunk || typeof chunk !== 'object') {
        return [];
      }

      const text = typeof chunk.text === 'string' ? chunk.text.trim() : '';
      const embedding = Array.isArray(chunk.embedding) ? chunk.embedding : [];

      if (text.length === 0 || embedding.length === 0) {
        return [];
      }

      return [
        {
          chunkIndex: Number.isInteger(chunk.chunkIndex)
            ? chunk.chunkIndex
            : index,
          text,
          startTime:
            chunk.startTime !== undefined && Number.isFinite(chunk.startTime)
              ? chunk.startTime
              : undefined,
          endTime:
            chunk.endTime !== undefined && Number.isFinite(chunk.endTime)
              ? chunk.endTime
              : undefined,
          embedding,
          embeddingModel: chunk.embeddingModel || 'gemini-embedding-001:384',
        },
      ];
    });

    return sanitized.length > 0 ? sanitized : undefined;
  }

  private normalizeOptionalText(
    value: unknown,
    maxChars: number,
  ): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();

    if (!normalized) {
      return undefined;
    }

    return normalized.length > maxChars
      ? normalized.slice(0, maxChars).trim()
      : normalized;
  }

  private normalizeTags(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const seen = new Set<string>();
    const tags: string[] = [];

    for (const rawTag of value) {
      if (typeof rawTag !== 'string') {
        continue;
      }

      const tag = rawTag
        .replace(/^#+/, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

      if (!tag || seen.has(tag)) {
        continue;
      }

      seen.add(tag);
      tags.push(tag);

      if (tags.length >= 8) {
        break;
      }
    }

    return tags.length > 0 ? tags : undefined;
  }
}
