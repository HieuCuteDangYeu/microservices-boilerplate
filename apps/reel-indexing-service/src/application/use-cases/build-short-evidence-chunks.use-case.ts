import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { EvidenceChunk } from '@indexing/domain/entities/evidence-chunk.entity';
import type { IIndexingApplicationConfig } from '@indexing/domain/interfaces/indexing-application-config.interface';
import { Inject, Injectable } from '@nestjs/common';

interface TimedToken {
  value: string;
  start: number;
  end: number;
  segmentId: string;
  audioArtifactId?: string;
  sentenceEnd: boolean;
}

@Injectable()
export class BuildShortEvidenceChunksUseCase {
  constructor(
    @Inject('IIndexingApplicationConfig')
    private readonly config: IIndexingApplicationConfig,
  ) {}

  execute(
    segments: TranscriptSegment[],
    prefix: 'INDEX_SHORT_CHUNK' | 'INDEX_LONG_CHUNK' = 'INDEX_SHORT_CHUNK',
  ): EvidenceChunk[] {
    const ordered = [...segments]
      .filter((segment) => segment.text.trim())
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const tokens = ordered.flatMap((segment, index) =>
      this.tokensForSegment(segment, index),
    );
    if (!tokens.length) return [];

    const maximum = this.positiveInt(`${prefix}_MAX_TOKENS`, 340, 20, 4_000);
    const target = this.positiveInt(
      `${prefix}_TARGET_TOKENS`,
      240,
      20,
      maximum,
    );
    const minimum = this.positiveInt(`${prefix}_MIN_TOKENS`, 100, 1, maximum);
    const overlap = this.positiveInt(
      `${prefix}_OVERLAP_TOKENS`,
      35,
      0,
      Math.max(0, maximum - 1),
    );
    const maxSeconds = this.positiveInt(`${prefix}_MAX_SECONDS`, 45, 5, 600);
    const largePauseSeconds =
      this.positiveInt('INDEX_CHUNK_LARGE_PAUSE_MS', 1_500, 100, 30_000) / 1000;
    const chunks: EvidenceChunk[] = [];
    let current: TimedToken[] = [];

    const flush = (preserveOverlap = true) => {
      if (!current.length) return;
      chunks.push(this.toChunk(current));
      current = preserveOverlap && overlap ? current.slice(-overlap) : [];
    };

    for (const token of tokens) {
      const previous = current.at(-1);
      const projectedDuration = current.length
        ? token.end - current[0].start
        : 0;
      const crossesLargePause =
        current.length >= minimum &&
        previous !== undefined &&
        token.start - previous.end >= largePauseSeconds;
      if (
        current.length &&
        (current.length >= maximum ||
          projectedDuration > maxSeconds ||
          crossesLargePause)
      ) {
        flush(!crossesLargePause);
      }
      current.push(token);
      if (current.length >= target && token.sentenceEnd) flush();
    }
    if (current.length > overlap || chunks.length === 0) flush();

    if (chunks.length > 1) {
      const last = chunks.at(-1)!;
      const previous = chunks.at(-2)!;
      const lastWords = last.evidenceText.split(/\s+/);
      const uniqueLast = lastWords.slice(Math.min(overlap, lastWords.length));
      const previousWords = previous.evidenceText.split(/\s+/);
      if (
        lastWords.length < minimum &&
        previousWords.length + uniqueLast.length <= maximum
      ) {
        previous.evidenceText = [...previousWords, ...uniqueLast].join(' ');
        previous.endTime = last.endTime;
        previous.sourceSegmentIds = this.unique([
          ...previous.sourceSegmentIds,
          ...last.sourceSegmentIds,
        ]);
        previous.sourceAudioArtifactIds = this.unique([
          ...previous.sourceAudioArtifactIds,
          ...last.sourceAudioArtifactIds,
        ]);
        chunks.pop();
      }
    }
    return chunks;
  }

  private tokensForSegment(
    segment: TranscriptSegment,
    ordinal: number,
  ): TimedToken[] {
    const words = segment.text.trim().split(/\s+/).filter(Boolean);
    const duration = Math.max(0, segment.end - segment.start);
    const sourceSegmentNumber =
      typeof segment['sourceSegmentNumber'] === 'number'
        ? segment['sourceSegmentNumber']
        : 0;
    const segmentId =
      typeof segment['sourceSegmentId'] === 'string'
        ? segment['sourceSegmentId']
        : `transcription:${sourceSegmentNumber}:${segment.id ?? ordinal}`;
    const audioArtifactId =
      typeof segment['sourceAudioArtifactId'] === 'string'
        ? segment['sourceAudioArtifactId']
        : undefined;
    return words.map((value, index) => ({
      value,
      start: segment.start + (duration * index) / Math.max(1, words.length),
      end: segment.start + (duration * (index + 1)) / Math.max(1, words.length),
      segmentId,
      audioArtifactId,
      sentenceEnd: /[.!?]["')\]]*$/.test(value),
    }));
  }

  private toChunk(tokens: TimedToken[]): EvidenceChunk {
    return {
      evidenceText: tokens.map((token) => token.value).join(' '),
      startTime: tokens[0].start,
      endTime: tokens.at(-1)!.end,
      sourceSegmentIds: this.unique(tokens.map((token) => token.segmentId)),
      sourceAudioArtifactIds: this.unique(
        tokens
          .map((token) => token.audioArtifactId)
          .filter((value): value is string => Boolean(value)),
      ),
    };
  }

  private unique(values: string[]): string[] {
    return [...new Set(values)];
  }

  private positiveInt(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isInteger(value)
      ? Math.min(maximum, Math.max(minimum, value))
      : fallback;
  }
}
