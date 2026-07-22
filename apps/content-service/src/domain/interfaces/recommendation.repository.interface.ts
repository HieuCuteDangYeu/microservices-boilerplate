import type { Reel } from '@content/domain/entities/reel.entity';
import type {
  RecommendationCandidateEvidence,
  RecommendationCandidateQuery,
  RecommendationRankingRequest,
  RecommendationRankingSnapshot,
} from '@content/domain/interfaces/recommendation.interface';

export interface IRecommendationRepository {
  findRecentQualityCandidates(
    query: RecommendationCandidateQuery,
  ): Promise<RecommendationCandidateEvidence[]>;

  findTrendingCandidates(
    query: RecommendationCandidateQuery,
  ): Promise<RecommendationCandidateEvidence[]>;

  findTagAffinityCandidates(
    query: RecommendationCandidateQuery,
  ): Promise<RecommendationCandidateEvidence[]>;

  findCreatorAffinityCandidates(
    query: RecommendationCandidateQuery,
  ): Promise<RecommendationCandidateEvidence[]>;

  findContentSimilarityCandidates(
    query: RecommendationCandidateQuery,
  ): Promise<RecommendationCandidateEvidence[]>;

  findSocialCandidates(
    query: RecommendationCandidateQuery,
  ): Promise<RecommendationCandidateEvidence[]>;

  findExplorationCandidates(
    query: RecommendationCandidateQuery,
  ): Promise<RecommendationCandidateEvidence[]>;

  findViewerInterestTags(viewerId: string, limit: number): Promise<string[]>;

  findEligibleReelsByIds(
    reelIds: string[],
    excludedUserIds: string[],
  ): Promise<Reel[]>;

  findRecentlySeenReelIds(viewerId: string, since: Date): Promise<Set<string>>;

  loadRankingSnapshot(
    request: RecommendationRankingRequest,
  ): Promise<RecommendationRankingSnapshot>;
}
