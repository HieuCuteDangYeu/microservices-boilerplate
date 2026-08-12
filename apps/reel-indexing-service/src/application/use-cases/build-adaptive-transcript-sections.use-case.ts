import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { BuildTranscriptSectionsUseCase } from '@indexing/application/use-cases/build-transcript-sections.use-case';
import type { TranscriptSection } from '@indexing/domain/entities/index-checkpoint.entity';
import type { IIndexingAiService } from '@indexing/domain/interfaces/ai-service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface BoundaryCandidate {
  index: number;
  semanticShift: number;
  normalizedPause: number;
  lexicalShift: number;
}

export interface AdaptiveSectioningEvaluation {
  legacySections: number;
  adaptiveSections: number;
  sectionCountDelta: number;
  boundaryAgreement: number;
  adaptiveAverageDurationSeconds: number;
  adaptiveMinDurationSeconds: number;
  adaptiveMaxDurationSeconds: number;
  adaptiveTooShortCount: number;
  adaptiveTooLongCount: number;
}

@Injectable()
export class BuildAdaptiveTranscriptSectionsUseCase {
  private readonly logger = new Logger(
    BuildAdaptiveTranscriptSectionsUseCase.name,
  );

  constructor(
    private readonly config: ConfigService,
    private readonly legacy: BuildTranscriptSectionsUseCase,
    @Inject('IIndexingAiService') private readonly ai: IIndexingAiService,
  ) {}

  async execute(segments: TranscriptSegment[]): Promise<TranscriptSection[]> {
    const ordered = [...segments]
      .filter((segment) => segment.text.trim())
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const legacy = this.legacy.execute(undefined, ordered);
    if (ordered.length < 2) return legacy;

    const enabled = this.boolean(
      'INDEX_LONG_ADAPTIVE_SECTIONING_ENABLED',
      false,
    );
    const shadow = this.boolean(
      'INDEX_LONG_ADAPTIVE_SECTIONING_SHADOW_MODE',
      true,
    );
    if (!enabled && !shadow) return legacy;
    if (!enabled && shadow && !this.shouldRunShadowEvaluation(ordered)) {
      return legacy;
    }

    const candidates = await this.scoreCandidates(ordered);
    const adaptive = this.buildSections(ordered, candidates);
    if (shadow) {
      const evaluation = this.evaluate(legacy, adaptive);
      this.logger.log(
        `[AdaptiveSectioningShadow] ${JSON.stringify(evaluation)}`,
      );
    }
    return enabled ? adaptive : legacy;
  }

  evaluate(
    legacy: TranscriptSection[],
    adaptive: TranscriptSection[],
  ): AdaptiveSectioningEvaluation {
    const minimum = this.number(
      'INDEX_LONG_SECTION_MIN_SECONDS',
      120,
      10,
      3_600,
    );
    const maximum = this.number(
      'INDEX_LONG_SECTION_MAX_SECONDS',
      480,
      minimum,
      14_400,
    );
    const tolerance = this.number(
      'INDEX_SECTION_BOUNDARY_EVAL_TOLERANCE_SECONDS',
      15,
      0,
      120,
    );
    const durations = adaptive.map((section) =>
      Math.max(0, (section.endMs - section.startMs) / 1000),
    );
    const adaptiveBoundaries = adaptive
      .slice(0, -1)
      .map((section) => section.endMs);
    const legacyBoundaries = legacy
      .slice(0, -1)
      .map((section) => section.endMs);
    const toleranceMs = tolerance * 1000;
    const matchedBoundaries = adaptiveBoundaries.filter((boundary) =>
      legacyBoundaries.some(
        (legacyBoundary) => Math.abs(legacyBoundary - boundary) <= toleranceMs,
      ),
    ).length;
    const boundaryDenominator = Math.max(
      adaptiveBoundaries.length,
      legacyBoundaries.length,
      1,
    );

    return {
      legacySections: legacy.length,
      adaptiveSections: adaptive.length,
      sectionCountDelta: adaptive.length - legacy.length,
      boundaryAgreement: matchedBoundaries / boundaryDenominator,
      adaptiveAverageDurationSeconds:
        durations.length > 0
          ? durations.reduce((sum, value) => sum + value, 0) / durations.length
          : 0,
      adaptiveMinDurationSeconds:
        durations.length > 0 ? Math.min(...durations) : 0,
      adaptiveMaxDurationSeconds:
        durations.length > 0 ? Math.max(...durations) : 0,
      adaptiveTooShortCount: durations.filter((value) => value < minimum)
        .length,
      adaptiveTooLongCount: durations.filter((value) => value > maximum).length,
    };
  }

  private shouldRunShadowEvaluation(segments: TranscriptSegment[]): boolean {
    const sampleRate = this.number(
      'INDEX_LONG_ADAPTIVE_SECTIONING_SHADOW_SAMPLE_RATE',
      0.1,
      0,
      1,
    );
    if (sampleRate <= 0) return false;
    if (sampleRate >= 1) return true;

    const fingerprint = [
      segments.length,
      segments[0]?.text ?? '',
      segments.at(-1)?.text ?? '',
    ].join('|');
    let hash = 2166136261;
    for (let index = 0; index < fingerprint.length; index += 1) {
      hash ^= fingerprint.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0xffffffff < sampleRate;
  }

  private async scoreCandidates(
    segments: TranscriptSegment[],
  ): Promise<BoundaryCandidate[]> {
    const pauseThreshold =
      this.number('INDEX_LONG_SECTION_CANDIDATE_PAUSE_MS', 1_500, 0, 30_000) /
      1000;
    const candidateIndexes = Array.from(
      { length: segments.length - 1 },
      (_, index) => index + 1,
    ).filter((index) => {
      const previous = segments[index - 1];
      const next = segments[index];
      return (
        next.start - previous.end >= pauseThreshold ||
        /[.!?]["')\]]*$/.test(previous.text.trim())
      );
    });
    if (!candidateIndexes.length) return [];

    const items = candidateIndexes.flatMap((index) => [
      {
        id: `boundary:${index}:left`,
        text: segments
          .slice(Math.max(0, index - 6), index)
          .map((segment) => segment.text.trim())
          .join(' '),
        taskType: 'RETRIEVAL_DOCUMENT' as const,
      },
      {
        id: `boundary:${index}:right`,
        text: segments
          .slice(index, Math.min(segments.length, index + 6))
          .map((segment) => segment.text.trim())
          .join(' '),
        taskType: 'RETRIEVAL_DOCUMENT' as const,
      },
    ]);
    const embeddings: Array<{ id: string; values: number[] }> = [];
    const batchSize = Math.round(
      this.number('INDEX_SECTION_EMBEDDING_BATCH_SIZE', 100, 2, 100),
    );
    for (let offset = 0; offset < items.length; offset += batchSize) {
      const result = await this.ai.generateEmbeddingBatch({
        items: items.slice(offset, offset + batchSize),
      });
      if (result.errors.length) {
        throw new Error(
          `Adaptive boundary embedding failed for ${result.errors.length} items`,
        );
      }
      embeddings.push(...result.embeddings);
    }
    const vectors = new Map(
      embeddings.map((embedding) => [embedding.id, embedding.values]),
    );
    return candidateIndexes.map((index) => {
      const left = vectors.get(`boundary:${index}:left`);
      const right = vectors.get(`boundary:${index}:right`);
      if (!left || !right || left.length !== right.length || !left.length) {
        throw new Error(`Adaptive boundary ${index} is missing embeddings`);
      }
      const previous = segments[index - 1];
      const next = segments[index];
      return {
        index,
        semanticShift: 1 - this.cosine(left, right),
        normalizedPause: Math.min(
          1,
          Math.max(0, next.start - previous.end) /
            Math.max(0.001, pauseThreshold),
        ),
        lexicalShift: this.lexicalShift(previous.text, next.text),
      };
    });
  }

  private buildSections(
    segments: TranscriptSegment[],
    candidates: BoundaryCandidate[],
  ): TranscriptSection[] {
    const minimum = this.number(
      'INDEX_LONG_SECTION_MIN_SECONDS',
      120,
      10,
      3_600,
    );
    const target = this.number(
      'INDEX_LONG_SECTION_TARGET_SECONDS',
      300,
      minimum,
      7_200,
    );
    const maximum = this.number(
      'INDEX_LONG_SECTION_MAX_SECONDS',
      480,
      target,
      14_400,
    );
    const threshold = this.number(
      'INDEX_SECTION_BOUNDARY_THRESHOLD',
      0.38,
      0,
      1,
    );
    const byIndex = new Map(
      candidates.map((candidate) => [candidate.index, candidate]),
    );
    const boundaries: number[] = [];
    let sectionStart = 0;

    for (let index = 1; index < segments.length; index += 1) {
      const candidate = byIndex.get(index);
      const duration = segments[index - 1].end - segments[sectionStart].start;
      const hardPause = (candidate?.normalizedPause ?? 0) >= 1;
      const score = candidate ? this.score(candidate, duration / target) : 0;
      const shouldSplit =
        (duration < minimum && hardPause && score >= threshold) ||
        (duration >= minimum && duration < target && score >= threshold) ||
        (duration >= target && score >= threshold * 0.7) ||
        duration >= maximum;
      if (shouldSplit) {
        boundaries.push(index);
        sectionStart = index;
      }
    }

    const ranges = [0, ...boundaries]
      .map((start, index) => ({
        start,
        end: boundaries[index] ?? segments.length,
      }))
      .filter((range) => range.end > range.start);
    return ranges.map((range, index) => {
      const values = segments.slice(range.start, range.end);
      return {
        index,
        startMs: Math.round(values[0].start * 1000),
        endMs: Math.round(values.at(-1)!.end * 1000),
        text: values.map((segment) => segment.text.trim()).join(' '),
      };
    });
  }

  private score(
    candidate: BoundaryCandidate,
    durationPressure: number,
  ): number {
    return (
      this.number('INDEX_SECTION_SEMANTIC_WEIGHT', 0.55, 0, 1) *
        candidate.semanticShift +
      this.number('INDEX_SECTION_PAUSE_WEIGHT', 0.2, 0, 1) *
        candidate.normalizedPause +
      this.number('INDEX_SECTION_LEXICAL_WEIGHT', 0.15, 0, 1) *
        candidate.lexicalShift +
      this.number('INDEX_SECTION_DURATION_WEIGHT', 0.1, 0, 1) *
        Math.min(1, Math.max(0, durationPressure))
    );
  }

  private cosine(left: number[], right: number[]): number {
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
      dot += left[index] * right[index];
      leftMagnitude += left[index] ** 2;
      rightMagnitude += right[index] ** 2;
    }
    const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
    return denominator ? Math.max(-1, Math.min(1, dot / denominator)) : 0;
  }

  private lexicalShift(left: string, right: string): number {
    const leftWords = this.words(left);
    const rightWords = this.words(right);
    const union = new Set([...leftWords, ...rightWords]);
    if (!union.size) return 0;
    const intersection = [...leftWords].filter((word) => rightWords.has(word));
    return 1 - intersection.length / union.size;
  }

  private words(text: string): Set<string> {
    return new Set(
      text
        .normalize('NFKC')
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean),
    );
  }

  private boolean(key: string, fallback: boolean): boolean {
    const value = this.config.get<string>(key);
    return value === undefined
      ? fallback
      : value.trim().toLowerCase() === 'true';
  }

  private number(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const value = Number(this.config.get<string>(key) ?? fallback);
    return Number.isFinite(value)
      ? Math.min(maximum, Math.max(minimum, value))
      : fallback;
  }
}
