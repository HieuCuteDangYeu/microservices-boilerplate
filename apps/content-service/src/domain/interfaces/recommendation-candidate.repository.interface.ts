import type { Reel } from '@content/domain/entities/reel.entity';
import type {
  CandidateSourceInput,
  RecommendationCandidateEvidence,
} from '@content/domain/interfaces/recommendation-candidate.interface';

export interface IRecommendationCandidateRepository {
  findRecentQualityCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]>;

  findTrendingCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]>;

  findTagAffinityCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]>;

  findCreatorAffinityCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]>;

  findContentSimilarityCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]>;

  findSocialCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]>;

  findExplorationCandidates(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]>;

  findRecentlySeenReelIds(viewerId: string, since: Date): Promise<Set<string>>;

  findEligibleReelsByIds(
    reelIds: string[],
    excludedUserIds: string[],
  ): Promise<Reel[]>;
}
