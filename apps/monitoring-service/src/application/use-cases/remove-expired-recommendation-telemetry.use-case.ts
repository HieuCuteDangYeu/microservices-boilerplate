import type { IRecommendationTelemetryRepository } from '@monitoring/domain/interfaces/recommendation-telemetry.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RemoveExpiredRecommendationTelemetryUseCase {
  constructor(
    @Inject('IRecommendationTelemetryRepository')
    private readonly recommendationTelemetryRepository: IRecommendationTelemetryRepository,
  ) {}

  async execute(receivedBefore: Date): Promise<{ deleted: number }> {
    const deleted =
      await this.recommendationTelemetryRepository.deleteReceivedBefore(
        receivedBefore,
      );

    return {
      deleted,
    };
  }
}
