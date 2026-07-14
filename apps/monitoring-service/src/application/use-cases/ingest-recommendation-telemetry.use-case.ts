import type { RecommendationTelemetryEvent } from '@monitoring/domain/entities/recommendation-telemetry-event.entity';
import type { IRecommendationTelemetryRepository } from '@monitoring/domain/interfaces/recommendation-telemetry.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class IngestRecommendationTelemetryUseCase {
  constructor(
    @Inject('IRecommendationTelemetryRepository')
    private readonly recommendationTelemetryRepository: IRecommendationTelemetryRepository,
  ) {}

  async execute(
    events: RecommendationTelemetryEvent[],
  ): Promise<{ accepted: number }> {
    const accepted =
      await this.recommendationTelemetryRepository.createMany(events);

    return {
      accepted,
    };
  }
}
