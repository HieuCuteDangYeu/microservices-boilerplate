import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { AudioSegmentCheckpoint } from '@indexing/domain/entities/index-checkpoint.entity';
import { Injectable } from '@nestjs/common';

export class MissingAudioSegmentsError extends Error {
  constructor(readonly missingSegmentNumbers: number[]) {
    super(
      `Missing completed audio segments: ${missingSegmentNumbers.join(', ')}`,
    );
    this.name = 'MissingAudioSegmentsError';
  }
}

export interface MergedTranscript {
  text?: string;
  segments?: TranscriptSegment[];
}

@Injectable()
export class MergeTranscriptSegmentsUseCase {
  execute(
    segments: AudioSegmentCheckpoint[],
    expectedCount: number,
  ): MergedTranscript {
    const byNumber = [...segments].sort(
      (left, right) => left.segmentNumber - right.segmentNumber,
    );
    const missing = Array.from(
      { length: expectedCount },
      (_, index) => index,
    ).filter((index) => {
      const segment = byNumber[index];
      return segment?.segmentNumber !== index || segment.status !== 'COMPLETED';
    });

    if (missing.length > 0) throw new MissingAudioSegmentsError(missing);
    if (expectedCount === 0) return {};

    let mergedText = '';
    const mergedSegments: Array<
      TranscriptSegment & { sourceSegmentNumber: number }
    > = [];
    let previousArtifactEndMs = 0;

    for (const checkpoint of byNumber) {
      const text = checkpoint.transcriptText?.trim() ?? '';
      const hasTimestampOverlap = checkpoint.startMs < previousArtifactEndMs;
      mergedText = this.appendWithOverlap(
        mergedText,
        text,
        hasTimestampOverlap,
      );

      for (const segment of checkpoint.transcriptSegments ?? []) {
        const offsetSeconds = checkpoint.startMs / 1000;
        const candidate = {
          ...segment,
          start: Math.max(0, Number(segment.start) + offsetSeconds),
          end: Math.max(0, Number(segment.end) + offsetSeconds),
          sourceSegmentNumber: checkpoint.segmentNumber,
        };
        const previous = mergedSegments.at(-1);

        if (previous && this.isDuplicateTimestampSegment(previous, candidate)) {
          continue;
        }

        mergedSegments.push(candidate);
      }

      previousArtifactEndMs = Math.max(previousArtifactEndMs, checkpoint.endMs);
    }

    mergedSegments.sort(
      (left, right) =>
        left.start - right.start ||
        left.sourceSegmentNumber - right.sourceSegmentNumber,
    );

    return {
      text: mergedText || undefined,
      segments: mergedSegments.length > 0 ? mergedSegments : undefined,
    };
  }

  private appendWithOverlap(
    existingText: string,
    nextText: string,
    hasTimestampOverlap: boolean,
  ): string {
    if (!existingText) return nextText;
    if (!nextText) return existingText;
    if (!hasTimestampOverlap) return `${existingText} ${nextText}`.trim();

    const existingWords = existingText.split(/\s+/);
    const nextWords = nextText.split(/\s+/);
    const maxWindow = Math.min(40, existingWords.length, nextWords.length);
    let overlapWords = 0;

    for (let size = maxWindow; size >= 2; size -= 1) {
      const suffix = existingWords.slice(-size).map(this.normalizeWord);
      const prefix = nextWords.slice(0, size).map(this.normalizeWord);
      const comparable = suffix.filter(Boolean).length;
      if (comparable === 0) continue;
      const matches = suffix.reduce(
        (count, word, index) =>
          count + (word && word === prefix[index] ? 1 : 0),
        0,
      );

      if (matches / comparable >= 0.8) {
        overlapWords = size;
        break;
      }
    }

    return `${existingText} ${nextWords.slice(overlapWords).join(' ')}`.trim();
  }

  private isDuplicateTimestampSegment(
    previous: TranscriptSegment,
    candidate: TranscriptSegment,
  ): boolean {
    const overlaps =
      candidate.start <= previous.end && candidate.end >= previous.start;
    if (!overlaps) return false;
    return this.textSimilarity(previous.text, candidate.text) >= 0.8;
  }

  private textSimilarity(left: string, right: string): number {
    const leftWords = left.split(/\s+/).map(this.normalizeWord).filter(Boolean);
    const rightWords = right
      .split(/\s+/)
      .map(this.normalizeWord)
      .filter(Boolean);
    const length = Math.max(leftWords.length, rightWords.length);
    if (length === 0) return 1;
    const matches = Array.from({ length }, (_, index) =>
      leftWords[index] === rightWords[index] ? 1 : 0,
    ).reduce((total, value) => total + value, 0);
    return matches / length;
  }

  private readonly normalizeWord = (word: string): string =>
    word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}
