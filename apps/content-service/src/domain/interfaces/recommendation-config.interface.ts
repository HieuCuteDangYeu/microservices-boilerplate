import type { RecommendationFeatureFlags } from '@common/recommendation/interfaces/recommendation-metadata.interface';

export interface IRecommendationConfig {
  getAlgorithmVersion(): string;
  getCandidateSource(): string;
  getFeatureFlags(): RecommendationFeatureFlags;
  isTelemetryEnabled(): boolean;
}
