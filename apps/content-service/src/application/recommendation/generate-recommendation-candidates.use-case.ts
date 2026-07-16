import { ContentSimilarityCandidateSource } from '@content/application/recommendation/candidate-generation/content-similarity-candidate.source';
import { CreatorAffinityCandidateSource } from '@content/application/recommendation/candidate-generation/creator-affinity-candidate.source';
import { ExplorationCandidateSource } from '@content/application/recommendation/candidate-generation/exploration-candidate.source';
import { RecentQualityCandidateSource } from '@content/application/recommendation/candidate-generation/recent-quality-candidate.source';
import { SocialCandidateSource } from '@content/application/recommendation/candidate-generation/social-candidate.source';
import { TagAffinityCandidateSource } from '@content/application/recommendation/candidate-generation/tag-affinity-candidate.source';
import { TrendingCandidateSource } from '@content/application/recommendation/candidate-generation/trending-candidate.source';
import { RecommendationCandidateMerger } from '@content/application/recommendation/recommendation-candidate-merger';
import { RecommendationEligibilityFilter } from '@content/application/recommendation/recommendation-eligibility-filter';
import type { IRecommendationCandidateSource } from '@content/domain/interfaces/recommendation-candidate-source.interface';
import type {
  GenerateRecommendationCandidatesInput,
  GenerateRecommendationCandidatesResult,
  RecommendationCandidateEvidence,
  RecommendationCandidateSource,
} from '@content/domain/interfaces/recommendation-candidate.interface';
import type { IRecommendationConfig } from '@content/domain/interfaces/recommendation-config.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GenerateRecommendationCandidatesUseCase {
  private readonly logger = new Logger(
    GenerateRecommendationCandidatesUseCase.name,
  );
  private readonly sources: IRecommendationCandidateSource[];

  constructor(
    recentQualitySource: RecentQualityCandidateSource,
    trendingSource: TrendingCandidateSource,
    tagAffinitySource: TagAffinityCandidateSource,
    creatorAffinitySource: CreatorAffinityCandidateSource,
    contentSimilaritySource: ContentSimilarityCandidateSource,
    socialSource: SocialCandidateSource,
    explorationSource: ExplorationCandidateSource,
    private readonly merger: RecommendationCandidateMerger,
    private readonly eligibilityFilter: RecommendationEligibilityFilter,
    @Inject('IRecommendationConfig')
    private readonly recommendationConfig: IRecommendationConfig,
  ) {
    this.sources = [
      recentQualitySource,
      trendingSource,
      tagAffinitySource,
      creatorAffinitySource,
      contentSimilaritySource,
      socialSource,
      explorationSource,
    ];
  }

  async execute(
    input: GenerateRecommendationCandidatesInput,
  ): Promise<GenerateRecommendationCandidatesResult> {
    const perSourceLimit = Math.min(Math.max(input.limit * 4, 24), 120);
    const sourceInput = {
      viewerId: input.viewerId,
      limit: perSourceLimit,
      cursor: input.cursor,
      excludedUserIds: input.excludedUserIds,
      friendUserIds: input.friendUserIds,
    };

    const featureFlags = this.recommendationConfig.getFeatureFlags();
    const enabledSources = this.sources.filter((source) => {
      if (source.source === 'SOCIAL') {
        return featureFlags['socialPool'] !== false;
      }

      return true;
    });

    const settled = await Promise.allSettled(
      enabledSources.map(async (source) => ({
        source: source.source,
        candidates: await source.generate(sourceInput),
      })),
    );

    const allCandidates: RecommendationCandidateEvidence[] = [];
    const sourceCounts: Partial<Record<RecommendationCandidateSource, number>> =
      {};

    for (let index = 0; index < settled.length; index += 1) {
      const result = settled[index];
      const source = enabledSources[index];
      if (result.status === 'rejected') {
        this.logger.warn(
          `Candidate source ${source.source} failed: ${this.describeError(
            result.reason,
          )}`,
        );
        sourceCounts[source.source] = 0;
        continue;
      }
      sourceCounts[result.value.source] = result.value.candidates.length;
      allCandidates.push(...result.value.candidates);
    }

    const mergedCandidates = this.merger.merge(allCandidates);
    const eligible = await this.eligibilityFilter.execute({
      viewerId: input.viewerId,
      limit: input.limit,
      candidates: mergedCandidates,
      excludedUserIds: input.excludedUserIds,
      excludeRecentlySeen: input.excludeRecentlySeen,
    });

    return {
      items: eligible.items,
      nextCursor: eligible.nextCursor,
      rawCandidateCount: allCandidates.length,
      deduplicatedCandidateCount: mergedCandidates.length,
      sourceCounts,
    };
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
