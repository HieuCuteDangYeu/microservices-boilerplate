import type { RecommendationCandidateEvidence } from './recommendation.interface';

export interface SemanticRecommendationInput {
  viewerId: string;
  interestTags: string[];
  limit: number;
}

export interface ISemanticRecommendationService {
  findCandidates(
    input: SemanticRecommendationInput,
  ): Promise<RecommendationCandidateEvidence[]>;
}
