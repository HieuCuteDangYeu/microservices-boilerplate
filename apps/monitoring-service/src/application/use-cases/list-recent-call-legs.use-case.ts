import { Inject, Injectable } from '@nestjs/common';
import type { ICallTelemetryRepository } from '../../domain/interfaces/call-telemetry.repository.interface';
import type { TelemetryQuery } from '../../domain/models/call-telemetry.model';

@Injectable()
export class ListRecentCallLegsUseCase {
  constructor(
    @Inject('ICallTelemetryRepository')
    private readonly repository: ICallTelemetryRepository,
  ) {}

  async execute(query: TelemetryQuery) {
    return this.repository.findRecentCallLegs(query);
  }
}
