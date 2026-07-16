export type RecommendationType = 'REEL' | 'USER';
export type RecommendationOutcome = 'SUCCEEDED' | 'FAILED';
export type RecommendationFeatureFlags = Record<string, boolean>;

export interface RecommendationMetadata {
  recommendationId: string;
  feedSessionId: string;
  algorithmVersion: string;
  candidateSource: string;
  candidateSources?: string[];
  rank: number;
  generatedAt: string;
}
