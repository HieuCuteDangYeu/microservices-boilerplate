import type {
  MergedRecommendationCandidate,
  RecommendationCandidateEvidence,
  RecommendationCandidateSource,
} from '@content/domain/interfaces/recommendation-candidate.interface';
import { Injectable } from '@nestjs/common';

interface MutableMergedCandidate {
  reelId: string;
  sourceScores: Partial<Record<RecommendationCandidateSource, number>>;
  reasons: Set<string>;
}

@Injectable()
export class RecommendationCandidateMerger {
  merge(
    candidates: RecommendationCandidateEvidence[],
  ): MergedRecommendationCandidate[] {
    const mergedByReelId = new Map<string, MutableMergedCandidate>();

    for (const candidate of candidates) {
      const score = this.clamp(candidate.sourceScore);
      const existing = mergedByReelId.get(candidate.reelId) ?? {
        reelId: candidate.reelId,
        sourceScores: {},
        reasons: new Set<string>(),
      };

      existing.sourceScores[candidate.source] = Math.max(
        existing.sourceScores[candidate.source] ?? 0,
        score,
      );

      for (const reason of candidate.reasons) {
        const normalized = reason.trim();
        if (normalized) existing.reasons.add(normalized.slice(0, 160));
      }

      mergedByReelId.set(candidate.reelId, existing);
    }

    return [...mergedByReelId.values()]
      .map((candidate) => this.finalize(candidate))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.reelId.localeCompare(right.reelId);
      });
  }

  private finalize(
    candidate: MutableMergedCandidate,
  ): MergedRecommendationCandidate {
    const sourceEntries = Object.entries(candidate.sourceScores) as Array<
      [RecommendationCandidateSource, number]
    >;
    sourceEntries.sort((left, right) => right[1] - left[1]);

    const sources = sourceEntries.map(([source]) => source);
    const primarySource = sources[0] ?? 'EXPLORATION';
    const unionScore = sourceEntries.reduce(
      (combined, [, score]) => 1 - (1 - combined) * (1 - this.clamp(score)),
      0,
    );
    const multiSourceBoost = Math.min(
      0.15,
      Math.max(0, sources.length - 1) * 0.04,
    );

    return {
      reelId: candidate.reelId,
      primarySource,
      sources,
      sourceScores: candidate.sourceScores,
      reasons: [...candidate.reasons].slice(0, 12),
      score: this.clamp(unionScore + multiSourceBoost),
    };
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, 0), 1);
  }
}
