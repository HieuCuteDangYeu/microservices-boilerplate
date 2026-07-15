import { Inject, Injectable } from '@nestjs/common';
import type { ICallTelemetryRepository } from '../../domain/interfaces/call-telemetry.repository.interface';

@Injectable()
export class GetCallTimelineUseCase {
  constructor(
    @Inject('ICallTelemetryRepository')
    private readonly repository: ICallTelemetryRepository,
  ) {}

  async execute(callId: string) {
    return this.repository.findTimeline(callId);
  }
}
