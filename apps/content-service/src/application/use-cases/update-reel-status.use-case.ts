import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
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
    embedding?: number[],
    thumbnailKey?: string,
    processingStage?: string,
    processingMessage?: string,
    processingProgress?: number,
  ) {
    let sanitizedTranscript = transcript;
    let sanitizedTranscriptVtt = transcriptVtt?.trim() || undefined;
    let sanitizedTranscriptSegments =
      this.normalizeTranscriptSegments(transcriptSegments);
    let sanitizedEmbedding = embedding;
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

      if (!embedding || embedding.length === 0) {
        sanitizedEmbedding = undefined;
        this.logger.warn(
          `Reel ${reelId}: completing without embedding because embedding is missing or empty`,
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
      sanitizedEmbedding,
      thumbnailKey,
      nextStage,
      nextMessage,
      nextProgress,
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
      /^\[.+\]$/, // "[anything in brackets]"
      /^(music|sound|noise)+$/i,
      /^(speaking|language|foreign)/i,
      /^(uh+|um+|ah+|er+)+$/i, // filler sounds
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
}
