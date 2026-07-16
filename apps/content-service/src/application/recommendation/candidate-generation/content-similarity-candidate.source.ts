import type { IRecommendationCandidateSource } from '@content/domain/interfaces/recommendation-candidate-source.interface';
import type {
  CandidateSourceInput,
  RecommendationCandidateEvidence,
} from '@content/domain/interfaces/recommendation-candidate.interface';
import type { IRecommendationCandidateRepository } from '@content/domain/interfaces/recommendation-candidate.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ContentSimilarityCandidateSource implements IRecommendationCandidateSource {
  readonly source = 'CONTENT_SIMILARITY' as const;

  constructor(
    @Inject('IRecommendationCandidateRepository')
    private readonly repository: IRecommendationCandidateRepository,
  ) {}

  generate(
    input: CandidateSourceInput,
  ): Promise<RecommendationCandidateEvidence[]> {
    return this.repository.findContentSimilarityCandidates(input);
  }
}
