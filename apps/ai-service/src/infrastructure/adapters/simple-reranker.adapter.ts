import type { IRerankerService } from '@ai/domain/interfaces/reranker.service.interface';
import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RerankCandidate {
  candidate: ReelContextSearchResult;
  tokens: Set<string>;
  relevanceScore: number;
}

@Injectable()
export class SimpleRerankerAdapter implements IRerankerService {
  constructor(private readonly configService: ConfigService) {}

  rerank(input: {
    queryText: string;
    candidates: ReelContextSearchResult[];
    limit: number;
  }): Promise<ReelContextSearchResult[]> {
    const limit = Math.min(
      Math.max(input.limit, 1),
      this.getInteger('AI_RAG_RERANK_MAX_LIMIT', 8, 1, 20),
    );

    const lambda = this.getNumber('AI_RAG_MMR_LAMBDA', 0.74, 0, 1);
    const sameReelPenalty = this.getNumber(
      'AI_RAG_MMR_SAME_REEL_PENALTY',
      0.22,
      0,
      1,
    );
    const temporalOverlapPenalty = this.getNumber(
      'AI_RAG_MMR_TEMPORAL_OVERLAP_PENALTY',
      0.7,
      0,
      1,
    );

    const query = this.normalize(input.queryText);
    const queryTerms = this.tokenize(query);
    const idf = this.buildIdfWeights(input.candidates, queryTerms);

    const remaining = input.candidates.map((candidate) =>
      this.buildRerankCandidate(candidate, query, queryTerms, idf),
    );

    const selected: RerankCandidate[] = [];

    while (remaining.length > 0 && selected.length < limit) {
      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let index = 0; index < remaining.length; index++) {
        const item = remaining[index];
        const diversityPenalty = this.calculateDiversityPenalty({
          candidate: item,
          selected,
          sameReelPenalty,
          temporalOverlapPenalty,
        });

        const mmrScore =
          selected.length === 0
            ? item.relevanceScore
            : lambda * item.relevanceScore - (1 - lambda) * diversityPenalty;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = index;
        }
      }

      const [chosen] = remaining.splice(bestIndex, 1);
      selected.push(chosen);
    }

    return Promise.resolve(
      selected.map((item) => ({
        ...item.candidate,
        rerankScore: item.relevanceScore,
      })),
    );
  }

  private buildRerankCandidate(
    candidate: ReelContextSearchResult,
    query: string,
    queryTerms: Set<string>,
    idf: Map<string, number>,
  ): RerankCandidate {
    const retrievalText =
      candidate.retrievalText?.trim() || candidate.chunkText.trim();
    const text = this.normalize(
      [
        candidate.title,
        candidate.description,
        candidate.tags.join(' '),
        retrievalText,
      ]
        .filter(Boolean)
        .join(' '),
    );
    const evidence = this.normalize(
      candidate.evidenceText?.trim() || candidate.chunkText,
    );
    const titleAndTags = this.normalize(
      [candidate.title, candidate.tags.join(' ')].filter(Boolean).join(' '),
    );
    const candidateTokens = this.tokenize(text);

    const exactPhraseScore =
      query.length > 0 && (text.includes(query) || evidence.includes(query))
        ? 1
        : 0;
    const weightedCoverage = this.calculateWeightedQueryCoverage(
      queryTerms,
      candidateTokens,
      idf,
    );
    const titleTagCoverage = this.calculateWeightedQueryCoverage(
      queryTerms,
      this.tokenize(titleAndTags),
      idf,
    );
    const retrievalSignal = this.calculateRetrievalSignal(candidate);

    const relevanceScore = this.clamp(
      retrievalSignal * 0.58 +
        weightedCoverage * 0.22 +
        exactPhraseScore * 0.12 +
        titleTagCoverage * 0.08,
      0,
      1,
    );

    return {
      candidate,
      tokens: candidateTokens,
      relevanceScore,
    };
  }

  private calculateRetrievalSignal(candidate: ReelContextSearchResult): number {
    const rrf = this.normalizeRrf(candidate.score ?? 0);
    const vector = this.clamp(candidate.vectorScore ?? 0, 0, 1);
    const lexical = this.clamp(
      Math.max(candidate.keywordScore ?? 0, candidate.metadataScore ?? 0),
      0,
      1,
    );
    const hasVector = (candidate.vectorScore ?? 0) > 0;
    const hasLexical =
      (candidate.keywordScore ?? 0) > 0 || (candidate.metadataScore ?? 0) > 0;

    if (hasVector && hasLexical) {
      return this.clamp(rrf * 0.45 + vector * 0.35 + lexical * 0.2, 0, 1);
    }

    if (hasVector) {
      return this.clamp(vector * 0.78 + rrf * 0.22, 0, 1);
    }

    return this.clamp(lexical * 0.78 + rrf * 0.22, 0, 1);
  }

  private normalizeRrf(score: number): number {
    if (!Number.isFinite(score) || score <= 0) return 0;
    // With RRF k=60, useful scores are numerically small. Saturation makes
    // them comparable to cosine/lexical signals without assuming a fixed
    // number of active retrieval lanes.
    return this.clamp(1 - Math.exp(-30 * score), 0, 1);
  }

  private buildIdfWeights(
    candidates: ReelContextSearchResult[],
    queryTerms: Set<string>,
  ): Map<string, number> {
    const documentCount = Math.max(1, candidates.length);
    const documentFrequency = new Map<string, number>();

    for (const candidate of candidates) {
      const tokens = this.tokenize(
        [
          candidate.title,
          candidate.description,
          candidate.tags.join(' '),
          candidate.retrievalText,
          candidate.chunkText,
        ]
          .filter(Boolean)
          .join(' '),
      );

      for (const term of queryTerms) {
        if (tokens.has(term)) {
          documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
        }
      }
    }

    return new Map(
      [...queryTerms].map((term) => {
        const df = documentFrequency.get(term) ?? 0;
        return [term, Math.log((documentCount + 1) / (df + 1)) + 1] as const;
      }),
    );
  }

  private calculateWeightedQueryCoverage(
    queryTerms: Set<string>,
    candidateTokens: Set<string>,
    idf: Map<string, number>,
  ): number {
    if (queryTerms.size === 0 || candidateTokens.size === 0) {
      return 0;
    }

    let matchedWeight = 0;
    let totalWeight = 0;

    for (const term of queryTerms) {
      const weight = idf.get(term) ?? 1;
      totalWeight += weight;
      if (candidateTokens.has(term)) {
        matchedWeight += weight;
      }
    }

    return totalWeight > 0 ? matchedWeight / totalWeight : 0;
  }

  private calculateDiversityPenalty(input: {
    candidate: RerankCandidate;
    selected: RerankCandidate[];
    sameReelPenalty: number;
    temporalOverlapPenalty: number;
  }): number {
    if (input.selected.length === 0) {
      return 0;
    }

    let maxPenalty = 0;

    for (const selectedItem of input.selected) {
      const textSimilarity = this.calculateJaccardSimilarity(
        input.candidate.tokens,
        selectedItem.tokens,
      );
      const sameReel =
        input.candidate.candidate.reelId === selectedItem.candidate.reelId;
      const reelSimilarity = sameReel ? input.sameReelPenalty : 0;
      const temporalSimilarity = sameReel
        ? this.calculateTemporalOverlap(
            input.candidate.candidate,
            selectedItem.candidate,
          ) * input.temporalOverlapPenalty
        : 0;

      maxPenalty = Math.max(
        maxPenalty,
        textSimilarity,
        reelSimilarity,
        temporalSimilarity,
      );
    }

    return maxPenalty;
  }

  private calculateTemporalOverlap(
    left: ReelContextSearchResult,
    right: ReelContextSearchResult,
  ): number {
    if (
      typeof left.startTime !== 'number' ||
      typeof left.endTime !== 'number' ||
      typeof right.startTime !== 'number' ||
      typeof right.endTime !== 'number'
    ) {
      return 0;
    }

    const intersection = Math.max(
      0,
      Math.min(left.endTime, right.endTime) -
        Math.max(left.startTime, right.startTime),
    );
    const union =
      Math.max(left.endTime, right.endTime) -
      Math.min(left.startTime, right.startTime);

    return union > 0 ? intersection / union : 0;
  }

  private calculateJaccardSimilarity(
    left: Set<string>,
    right: Set<string>,
  ): number {
    if (left.size === 0 || right.size === 0) {
      return 0;
    }

    let intersection = 0;

    for (const token of left) {
      if (right.has(token)) {
        intersection += 1;
      }
    }

    const union = left.size + right.size - intersection;

    return union <= 0 ? 0 : intersection / union;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s.#_-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      this.normalize(value)
        .split(' ')
        .map((term) => term.replace(/^#/, '').trim())
        .filter((term) => term.length >= 2),
    );
  }

  private getNumber(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(value, min), max);
  }

  private getInteger(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    return Math.round(this.getNumber(key, fallback, min, max));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
