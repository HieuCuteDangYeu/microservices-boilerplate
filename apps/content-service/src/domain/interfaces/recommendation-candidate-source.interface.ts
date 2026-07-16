import type {
  CandidateSourceInput,
  RecommendationCandidateEvidence,
  RecommendationCandidateSource,
} from '@content/domain/interfaces/recommendation-candidate.interface';

export interface IRecommendationCandidateSource {
  readonly source: RecommendationCandidateSource;

  generate(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]>;
}
