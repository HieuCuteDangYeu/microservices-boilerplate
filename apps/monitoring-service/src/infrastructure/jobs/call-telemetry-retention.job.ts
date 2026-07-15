import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PurgeExpiredCallTelemetryUseCase } from '../../application/use-cases/purge-expired-call-telemetry.use-case';

@Injectable()
export class CallTelemetryRetentionJob {
  constructor(
    private readonly purgeExpiredTelemetry: PurgeExpiredCallTelemetryUseCase,
  ) {}

  @Cron('0 0 * * *', { timeZone: 'UTC' })
  async execute() {
    await this.purgeExpiredTelemetry.execute();
  }
}
