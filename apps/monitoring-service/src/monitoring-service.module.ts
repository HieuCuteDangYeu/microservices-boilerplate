import { CallTelemetryTokenService } from '@common/calls/call-telemetry-token.service';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CallTelemetryService } from './application/services/call-telemetry.service';
import { CallTelemetryController } from './infrastructure/controllers/call-telemetry.controller';
import { MonitoringHealthController } from './infrastructure/controllers/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [CallTelemetryController, MonitoringHealthController],
  providers: [CallTelemetryService, CallTelemetryTokenService],
})
export class MonitoringServiceModule {}
