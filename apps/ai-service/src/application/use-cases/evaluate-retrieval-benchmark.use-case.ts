import { Injectable } from '@nestjs/common';

export interface RetrievalBenchmarkCase {
  id: string;
  relevantIds: string[];
  directRankedIds: string[];
  hierarchicalRankedIds: string[];
}

export interface RetrievalBenchmarkMetrics {
  recallAtK: number;
  reciprocalRank: number;
  ndcgAtK: number;
}

export interface RetrievalBenchmarkSummary {
  cases: number;
  k: number;
  direct: RetrievalBenchmarkMetrics;
  hierarchical: RetrievalBenchmarkMetrics;
  delta: RetrievalBenchmarkMetrics;
}

@Injectable()
export class EvaluateRetrievalBenchmarkUseCase {
  execute(
    cases: RetrievalBenchmarkCase[],
    k = 5,
  ): RetrievalBenchmarkSummary {
    const normalizedK = Math.min(Math.max(Math.floor(k), 1), 100);
    const validCases = cases.filter(
      (item) => item.id.trim() && item.relevantIds.length > 0,
    );

    if (validCases.length === 0) {
      return {
        cases: 0,
        k: normalizedK,
        direct: this.emptyMetrics(),
        hierarchical: this.emptyMetrics(),
        delta: this.emptyMetrics(),
      };
    }

    const direct = this.average(
      validCases.map((item) =>
        this.metrics(item.directRankedIds, item.relevantIds, normalizedK),
      ),
    );
    const hierarchical = this.average(
      validCases.map((item) =>
        this.metrics(item.hierarchicalRankedIds, item.relevantIds, normalizedK),
      ),
    );

    return {
      cases: validCases.length,
      k: normalizedK,
      direct,
      hierarchical,
      delta: {
        recallAtK: hierarchical.recallAtK - direct.recallAtK,
        reciprocalRank:
          hierarchical.reciprocalRank - direct.reciprocalRank,
        ndcgAtK: hierarchical.ndcgAtK - direct.ndcgAtK,
      },
    };
  }

  private metrics(
    rankedIds: string[],
    relevantIds: string[],
    k: number,
  ): RetrievalBenchmarkMetrics {
    const relevant = new Set(relevantIds);
    const ranked = [...new Set(rankedIds)].slice(0, k);
    const hits = ranked.filter((id) => relevant.has(id));
    const firstRelevantRank = ranked.findIndex((id) => relevant.has(id));
    const dcg = ranked.reduce(
      (score, id, index) =>
        score + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0),
      0,
    );
    const idealHitCount = Math.min(relevant.size, k);
    const idealDcg = Array.from({ length: idealHitCount }).reduce<number>(
      (score, _, index) => score + 1 / Math.log2(index + 2),
      0,
    );

    return {
      recallAtK: relevant.size > 0 ? hits.length / relevant.size : 0,
      reciprocalRank:
        firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0,
      ndcgAtK: idealDcg > 0 ? dcg / idealDcg : 0,
    };
  }

  private average(
    values: RetrievalBenchmarkMetrics[],
  ): RetrievalBenchmarkMetrics {
    const count = Math.max(values.length, 1);
    return values.reduce<RetrievalBenchmarkMetrics>(
      (result, value) => ({
        recallAtK: result.recallAtK + value.recallAtK / count,
        reciprocalRank:
          result.reciprocalRank + value.reciprocalRank / count,
        ndcgAtK: result.ndcgAtK + value.ndcgAtK / count,
      }),
      this.emptyMetrics(),
    );
  }

  private emptyMetrics(): RetrievalBenchmarkMetrics {
    return {
      recallAtK: 0,
      reciprocalRank: 0,
      ndcgAtK: 0,
    };
  }
}
