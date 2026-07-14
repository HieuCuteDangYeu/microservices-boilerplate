import type {
  RecommendationFeatureFlags,
  RecommendationOutcome,
  RecommendationType,
} from '@common/recommendation/interfaces/recommendation-metadata.interface';

export class RecommendationTelemetryEvent {
  constructor(
    public readonly eventId: string,
    public readonly recommendationType: RecommendationType,
    public readonly algorithmVersion: string,
    public readonly feedSessionId: string,
    public readonly route: string,
    public readonly candidateSource: string,
    public readonly requestedLimit: number,
    public readonly returnedItems: number,
    public readonly latencyMs: number,
    public readonly outcome: RecommendationOutcome,
    public readonly errorCode: string | null,
    public readonly featureFlags: RecommendationFeatureFlags,
    public readonly occurredAt: Date,
  ) {}
}
