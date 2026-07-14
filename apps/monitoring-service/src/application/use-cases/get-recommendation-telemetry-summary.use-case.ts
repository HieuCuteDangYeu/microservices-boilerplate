import type {
  IRecommendationTelemetryRepository,
  RecommendationTelemetryQuery,
  RecommendationTelemetrySummaryResult,
} from '@monitoring/domain/interfaces/recommendation-telemetry.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetRecommendationTelemetrySummaryUseCase {
  constructor(
    @Inject('IRecommendationTelemetryRepository')
    private readonly recommendationTelemetryRepository: IRecommendationTelemetryRepository,
  ) {}

  async execute(
    query: RecommendationTelemetryQuery,
  ): Promise<RecommendationTelemetrySummaryResult> {
    return this.recommendationTelemetryRepository.getSummary(query);
  }
}
