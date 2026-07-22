import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { TranscriptSection } from '@indexing/domain/entities/index-checkpoint.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BuildTranscriptSectionsUseCase {
  execute(text?: string, segments?: TranscriptSegment[]): TranscriptSection[] {
    if (segments && segments.length > 0) {
      return this.fromSegments(segments);
    }

    const normalized = text?.trim();
    if (!normalized) return [];

    return this.splitText(normalized).map((sectionText, index) => ({
      index,
      startMs: 0,
      endMs: 0,
      text: sectionText,
    }));
  }

  private fromSegments(segments: TranscriptSegment[]): TranscriptSection[] {
    const sections: TranscriptSection[] = [];
    let current: TranscriptSegment[] = [];

    const flush = () => {
      if (current.length === 0) return;
      sections.push({
        index: sections.length,
        startMs: Math.round(current[0].start * 1000),
        endMs: Math.round(current[current.length - 1].end * 1000),
        text: current
          .map((segment) => segment.text.trim())
          .filter(Boolean)
          .join(' '),
      });
      current = [];
    };

    for (const segment of [...segments].sort(
      (left, right) => left.start - right.start,
    )) {
      const projectedTextLength =
        current.reduce((total, value) => total + value.text.length, 0) +
        segment.text.length;
      const projectedDurationMs = current.length
        ? (segment.end - current[0].start) * 1000
        : 0;

      if (
        current.length > 0 &&
        (projectedTextLength > 6_000 || projectedDurationMs > 300_000)
      ) {
        flush();
      }
      current.push(segment);
    }
    flush();
    return sections;
  }

  private splitText(text: string): string[] {
    const sections: string[] = [];
    let remainder = text;
    while (remainder.length > 0) {
      if (remainder.length <= 6_000) {
        sections.push(remainder);
        break;
      }
      const candidate = remainder.slice(0, 6_000);
      const boundary = Math.max(
        candidate.lastIndexOf('. '),
        candidate.lastIndexOf(' '),
      );
      const splitAt = boundary >= 4_000 ? boundary + 1 : 6_000;
      sections.push(remainder.slice(0, splitAt).trim());
      remainder = remainder.slice(splitAt).trim();
    }
    return sections;
  }
}
