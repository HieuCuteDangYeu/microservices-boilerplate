import type { RecommendationTelemetryEventPayload } from '@common/recommendation/interfaces/recommendation-telemetry.interface';

export interface IRecommendationTelemetryService {
  publish(event: RecommendationTelemetryEventPayload): void;
}
