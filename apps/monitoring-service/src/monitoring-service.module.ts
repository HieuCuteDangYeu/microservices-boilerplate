import { CallTelemetryTokenService } from '@common/calls/call-telemetry-token.service';
import { CallTelemetryService } from '@monitoring/application/services/call-telemetry.service';
import { GetRecommendationTelemetrySummaryUseCase } from '@monitoring/application/use-cases/get-recommendation-telemetry-summary.use-case';
import { IngestRecommendationTelemetryUseCase } from '@monitoring/application/use-cases/ingest-recommendation-telemetry.use-case';
import { RemoveExpiredRecommendationTelemetryUseCase } from '@monitoring/application/use-cases/remove-expired-recommendation-telemetry.use-case';
import { CallTelemetryController } from '@monitoring/infrastructure/controllers/call-telemetry.controller';
import { MonitoringHealthController } from '@monitoring/infrastructure/controllers/health.controller';
import { RecommendationTelemetryController } from '@monitoring/infrastructure/controllers/recommendation-telemetry.controller';
import { RecommendationTelemetryCleanupJob } from '@monitoring/infrastructure/jobs/recommendation-telemetry-cleanup.job';
import { PrismaService } from '@monitoring/infrastructure/prisma/prisma.service';
import { RecommendationTelemetryRepository } from '@monitoring/infrastructure/repositories/recommendation-telemetry.repository';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    CallTelemetryController,
    RecommendationTelemetryController,
    MonitoringHealthController,
  ],
  providers: [
    CallTelemetryService,
    CallTelemetryTokenService,
    PrismaService,
    IngestRecommendationTelemetryUseCase,
    GetRecommendationTelemetrySummaryUseCase,
    RemoveExpiredRecommendationTelemetryUseCase,
    RecommendationTelemetryCleanupJob,
    {
      provide: 'IRecommendationTelemetryRepository',
      useClass: RecommendationTelemetryRepository,
    },
  ],
})
export class MonitoringServiceModule {}
