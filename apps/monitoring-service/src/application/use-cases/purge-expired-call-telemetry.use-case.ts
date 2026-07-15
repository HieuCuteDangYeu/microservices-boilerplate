import { Inject, Injectable } from '@nestjs/common';
import type { ICallTelemetryRepository } from '../../domain/interfaces/call-telemetry.repository.interface';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class PurgeExpiredCallTelemetryUseCase {
  constructor(
    @Inject('ICallTelemetryRepository')
    private readonly repository: ICallTelemetryRepository,
  ) {}

  async execute(now = new Date()) {
    return this.repository.deleteReceivedBefore(
      new Date(now.getTime() - RETENTION_MS),
    );
  }
}
