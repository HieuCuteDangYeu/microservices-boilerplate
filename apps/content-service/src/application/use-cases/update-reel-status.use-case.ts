import { Inject, Injectable } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class UpdateReelStatusUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(
    reelId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    embedding?: number[],
    thumbnailKey?: string,
  ) {
    if (status === 'COMPLETED') {
      if (!transcript || transcript.trim() === '') {
        throw new Error(
          `Reel ${reelId}: cannot mark COMPLETED — transcript is missing or empty`,
        );
      }
      if (!embedding || embedding.length === 0) {
        throw new Error(
          `Reel ${reelId}: cannot mark COMPLETED — embedding is missing or empty`,
        );
      }

      const quality = this.validateTranscriptQuality(transcript);
      if (!quality.valid) {
        throw new Error(
          `Reel ${reelId}: cannot mark COMPLETED — transcript quality check failed: "${quality.reason}"`,
        );
      }
    }

    return await this.contentRepository.updateReelStatus(
      reelId,
      status,
      transcript,
      embedding,
      thumbnailKey,
    );
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
}
