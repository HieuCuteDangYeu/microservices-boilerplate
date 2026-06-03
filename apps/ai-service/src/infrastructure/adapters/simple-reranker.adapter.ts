import type { IRerankerService } from '@ai/domain/interfaces/reranker.service.interface';
import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SimpleRerankerAdapter implements IRerankerService {
  rerank(input: {
    queryText: string;
    candidates: ReelContextSearchResult[];
    limit: number;
  }): Promise<ReelContextSearchResult[]> {
    const query = this.normalize(input.queryText);
    const queryTerms = this.tokenize(query);

    const rerankedCandidates = [...input.candidates]
      .map((candidate) => {
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

        const exactPhraseBonus =
          query.length > 0 && text.includes(query) ? 0.15 : 0;

        const overlapCount = queryTerms.filter((term) =>
          text.includes(term),
        ).length;

        const keywordOverlapBonus =
          queryTerms.length > 0
            ? Math.min(overlapCount / queryTerms.length, 1) * 0.15
            : 0;

        const baseScore = candidate.score ?? candidate.vectorScore ?? 0;

        return {
          candidate,
          rerankScore: baseScore * 0.7 + exactPhraseBonus + keywordOverlapBonus,
        };
      })
      .sort((a, b) => b.rerankScore - a.rerankScore)
      .slice(0, Math.min(Math.max(input.limit, 1), 8))
      .map((item) => ({
        ...item.candidate,
        score: item.rerankScore,
      }));

    return Promise.resolve(rerankedCandidates);
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private tokenize(value: string): string[] {
    return this.normalize(value)
      .split(/[\s,.;:!?()[\]{}"'`~@#$%^&*_+=/\\|-]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2);
  }
}
