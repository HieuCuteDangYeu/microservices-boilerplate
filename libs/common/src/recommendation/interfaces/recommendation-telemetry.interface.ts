import type {
  RecommendationFeatureFlags,
  RecommendationOutcome,
  RecommendationType,
} from '@common/recommendation/interfaces/recommendation-metadata.interface';

export interface RecommendationTelemetryEventPayload {
  eventId: string;
  recommendationType: RecommendationType;
  algorithmVersion: string;
  feedSessionId: string;
  route: string;
  candidateSource: string;
  requestedLimit: number;
  returnedItems: number;
  latencyMs: number;
  outcome: RecommendationOutcome;
  errorCode?: string;
  featureFlags: RecommendationFeatureFlags;
  occurredAt: string;
}

export interface TrackRecommendationTelemetryPayload {
  events: RecommendationTelemetryEventPayload[];
}
