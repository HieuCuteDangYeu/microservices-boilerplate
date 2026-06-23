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

    const lambda = this.getNumber('AI_RAG_MMR_LAMBDA', 0.72, 0, 1);
    const sameReelPenalty = this.getNumber(
      'AI_RAG_MMR_SAME_REEL_PENALTY',
      0.25,
      0,
      1,
    );

    const query = this.normalize(input.queryText);
    const queryTerms = this.tokenize(query);

    const remaining = input.candidates.map((candidate) =>
      this.buildRerankCandidate(candidate, query, queryTerms),
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
  ): RerankCandidate {
    const text = this.normalize(
      [
        candidate.title,
        candidate.description,
        candidate.tags.join(' '),
        candidate.chunkText,
      ]
        .filter(Boolean)
        .join(' '),
    );

    const candidateTokens = this.tokenize(text);

    const exactPhraseScore = query.length > 0 && text.includes(query) ? 1 : 0;

    const overlapScore = this.calculateTokenOverlap(
      queryTerms,
      candidateTokens,
    );

    const baseScore = this.clamp(
      candidate.score ?? candidate.vectorScore ?? candidate.keywordScore ?? 0,
      0,
      1,
    );

    const relevanceScore =
      baseScore * 0.72 + exactPhraseScore * 0.1 + overlapScore * 0.18;

    return {
      candidate,
      tokens: candidateTokens,
      relevanceScore,
    };
  }

  private calculateDiversityPenalty(input: {
    candidate: RerankCandidate;
    selected: RerankCandidate[];
    sameReelPenalty: number;
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

      const reelSimilarity =
        input.candidate.candidate.reelId === selectedItem.candidate.reelId
          ? input.sameReelPenalty
          : 0;

      maxPenalty = Math.max(maxPenalty, textSimilarity, reelSimilarity);
    }

    return maxPenalty;
  }

  private calculateTokenOverlap(
    queryTerms: Set<string>,
    candidateTokens: Set<string>,
  ): number {
    if (queryTerms.size === 0 || candidateTokens.size === 0) {
      return 0;
    }

    let overlap = 0;

    for (const term of queryTerms) {
      if (candidateTokens.has(term)) {
        overlap += 1;
      }
    }

    return overlap / queryTerms.size;
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

    if (union <= 0) {
      return 0;
    }

    return intersection / union;
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      this.normalize(value)
        .split(' ')
        .map((term) => term.trim())
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
