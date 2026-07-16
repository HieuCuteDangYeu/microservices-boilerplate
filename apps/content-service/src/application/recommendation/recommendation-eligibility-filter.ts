import type { ReelCursor } from '@content/domain/interfaces/content.repository.interface';
import type {
  GeneratedRecommendationItem,
  MergedRecommendationCandidate,
} from '@content/domain/interfaces/recommendation-candidate.interface';
import type { IRecommendationCandidateRepository } from '@content/domain/interfaces/recommendation-candidate.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

export interface RecommendationEligibilityInput {
  viewerId: string;
  limit: number;
  candidates: MergedRecommendationCandidate[];
  excludedUserIds: string[];
  excludeRecentlySeen?: boolean;
}

export interface RecommendationEligibilityResult {
  items: GeneratedRecommendationItem[];
  nextCursor: ReelCursor | null;
}

@Injectable()
export class RecommendationEligibilityFilter {
  constructor(
    @Inject('IRecommendationCandidateRepository')
    private readonly repository: IRecommendationCandidateRepository,
  ) {}

  async execute(
    input: RecommendationEligibilityInput,
  ): Promise<RecommendationEligibilityResult> {
    let candidates = input.candidates;

    if (input.excludeRecentlySeen !== false) {
      const recentlySeenSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentlySeenIds = await this.repository.findRecentlySeenReelIds(
        input.viewerId,
        recentlySeenSince,
      );
      candidates = candidates.filter(
        (candidate) => !recentlySeenIds.has(candidate.reelId),
      );
    }

    const eligibleReels = await this.repository.findEligibleReelsByIds(
      candidates.map((candidate) => candidate.reelId),
      input.excludedUserIds,
    );
    const reelById = new Map(eligibleReels.map((reel) => [reel.id, reel]));

    const items = candidates
      .map((candidate) => {
        const reel = reelById.get(candidate.reelId);
        return reel ? { reel, candidate } : null;
      })
      .filter((item): item is GeneratedRecommendationItem => item !== null)
      .slice(0, input.limit);

    return { items, nextCursor: this.buildNextCursor(items) };
  }

  private buildNextCursor(
    items: GeneratedRecommendationItem[],
  ): ReelCursor | null {
    if (items.length === 0) return null;

    const chronological = items
      .map((item) => item.reel)
      .sort((left, right) => {
        const dateDifference =
          right.createdAt.getTime() - left.createdAt.getTime();
        if (dateDifference !== 0) return dateDifference;
        return left.id.localeCompare(right.id);
      });
    const last = chronological[chronological.length - 1];

    return { createdAt: last.createdAt, id: last.id };
  }
}
