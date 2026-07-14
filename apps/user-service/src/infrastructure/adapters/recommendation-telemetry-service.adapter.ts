import type { RecommendationTelemetryEventPayload } from '@common/recommendation/interfaces/recommendation-telemetry.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import type { IRecommendationTelemetryService } from '@user/domain/interfaces/recommendation-telemetry-service.interface';

@Injectable()
export class RecommendationTelemetryServiceAdapter implements IRecommendationTelemetryService {
  private readonly logger = new Logger(
    RecommendationTelemetryServiceAdapter.name,
  );

  constructor(
    @Inject('MONITORING_SERVICE_RMQ')
    private readonly monitoringClient: ClientProxy,
  ) {}

  publish(event: RecommendationTelemetryEventPayload): void {
    try {
      this.monitoringClient
        .emit('recommendation.telemetry.ingest', {
          events: [event],
        })
        .subscribe({
          error: (error: unknown) => {
            this.logger.warn(this.describeError(error));
          },
        });
    } catch (error) {
      this.logger.warn(this.describeError(error));
    }
  }

  private describeError(error: unknown): string {
    return error instanceof Error
      ? `Recommendation telemetry publish failed: ${error.message}`
      : 'Recommendation telemetry publish failed';
  }
}
