import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { TranscriptSection } from '@indexing/domain/entities/index-checkpoint.entity';
import { Injectable } from '@nestjs/common';

export interface SectionQualitySelection {
  sections: TranscriptSection[];
  usedFallback: boolean;
  reason?: string;
}

@Injectable()
export class SelectHealthyTranscriptSectionsUseCase {
  execute(input: {
    candidate: TranscriptSection[];
    fallback: TranscriptSection[];
    sourceSegments: TranscriptSegment[];
    minimumSeconds: number;
    maximumSeconds: number;
  }): SectionQualitySelection {
    const reason = this.failureReason(input);
    if (!reason) {
      return { sections: input.candidate, usedFallback: false };
    }

    if (input.fallback.length === 0) {
      throw new Error(`Transcript section quality gate failed: ${reason}`);
    }

    return {
      sections: input.fallback,
      usedFallback: true,
      reason,
    };
  }

  private failureReason(input: {
    candidate: TranscriptSection[];
    sourceSegments: TranscriptSegment[];
    minimumSeconds: number;
    maximumSeconds: number;
  }): string | undefined {
    if (input.candidate.length === 0)
      return 'no candidate sections were produced';

    const source = [...input.sourceSegments]
      .filter((segment) => segment.text.trim())
      .sort((left, right) => left.start - right.start || left.end - right.end);
    if (source.length === 0) return 'source transcript segments are empty';

    let previousEnd = -1;
    let tinyCount = 0;
    for (const section of input.candidate) {
      if (!section.text.trim()) return `section ${section.index} has no text`;
      if (section.startMs < 0 || section.endMs <= section.startMs) {
        return `section ${section.index} has invalid timestamps`;
      }
      if (section.startMs < previousEnd) {
        return `section ${section.index} overlaps the previous section`;
      }
      previousEnd = section.endMs;

      const durationSeconds = (section.endMs - section.startMs) / 1000;
      if (durationSeconds > input.maximumSeconds * 1.15) {
        return `section ${section.index} exceeds the maximum duration tolerance`;
      }
      if (durationSeconds < input.minimumSeconds * 0.5) tinyCount += 1;
    }

    const tinyRatio = tinyCount / input.candidate.length;
    if (input.candidate.length >= 3 && tinyRatio > 0.35) {
      return `too many undersized sections (${tinyRatio.toFixed(2)})`;
    }

    const sourceStartMs = Math.round(source[0].start * 1000);
    const sourceEndMs = Math.round(source.at(-1)!.end * 1000);
    const toleranceMs = 2_000;
    if (Math.abs(input.candidate[0].startMs - sourceStartMs) > toleranceMs) {
      return 'candidate sections do not cover the beginning of the transcript';
    }
    if (Math.abs(input.candidate.at(-1)!.endMs - sourceEndMs) > toleranceMs) {
      return 'candidate sections do not cover the end of the transcript';
    }

    return undefined;
  }
}
