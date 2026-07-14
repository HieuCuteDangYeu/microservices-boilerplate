import { RemoveExpiredRecommendationTelemetryUseCase } from '@monitoring/application/use-cases/remove-expired-recommendation-telemetry.use-case';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class RecommendationTelemetryCleanupJob {
  constructor(
    private readonly removeExpiredRecommendationTelemetryUseCase: RemoveExpiredRecommendationTelemetryUseCase,
    private readonly configService: ConfigService,
  ) {}

  @Cron('30 0 * * *', {
    timeZone: 'UTC',
  })
  async execute(): Promise<void> {
    const retentionDays = this.readRetentionDays();

    const receivedBefore = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    await this.removeExpiredRecommendationTelemetryUseCase.execute(
      receivedBefore,
    );
  }

  private readRetentionDays(): number {
    const value = Number(
      this.configService.get<string>(
        'RECOMMENDATION_TELEMETRY_RETENTION_DAYS',
      ) ?? '90',
    );

    if (!Number.isInteger(value) || value < 1 || value > 3650) {
      throw new Error('RECOMMENDATION_TELEMETRY_RETENTION_DAYS is invalid');
    }

    return value;
  }
}
