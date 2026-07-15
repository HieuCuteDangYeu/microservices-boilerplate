import type { CallTelemetryEventPayload } from '@common/calls/dtos/call-telemetry.dto';
import { Inject, Injectable } from '@nestjs/common';
import { InvalidTelemetryTokenError } from '../../domain/errors/invalid-telemetry-token.error';
import type { ICallTelemetryRepository } from '../../domain/interfaces/call-telemetry.repository.interface';
import type { ICallTelemetryTokenVerifier } from '../../domain/interfaces/call-telemetry-token-verifier.interface';
import type {
  StoredCallTelemetryEvent,
  TelemetryJsonObject,
} from '../../domain/models/call-telemetry.model';

@Injectable()
export class IngestCallTelemetryUseCase {
  constructor(
    @Inject('ICallTelemetryRepository')
    private readonly repository: ICallTelemetryRepository,
    @Inject('ICallTelemetryTokenVerifier')
    private readonly tokenVerifier: ICallTelemetryTokenVerifier,
  ) {}

  async execute(events: CallTelemetryEventPayload[]) {
    const accepted = await this.repository.create(
      events.map((event) => this.toStoredEvent(event)),
    );

    return { accepted };
  }

  private toStoredEvent(
    event: CallTelemetryEventPayload,
  ): StoredCallTelemetryEvent {
    const token = event.telemetryToken
      ? this.tokenVerifier.verify(event.telemetryToken)
      : null;

    if (event.telemetryToken && !token) {
      throw new InvalidTelemetryTokenError();
    }

    const metricsJson: TelemetryJsonObject | null =
      event.metrics || event.details
        ? {
            ...event.metrics,
            ...(event.details ? { details: event.details } : {}),
          }
        : null;

    return {
      eventId: event.eventId,
      attemptId: event.attemptId,
      callId: token?.callId ?? null,
      role: token?.role ?? null,
      eventType: event.eventType,
      stage: event.stage,
      outcome: event.outcome ?? null,
      elapsedMs: Math.round(event.elapsedMs),
      occurredAt: new Date(event.occurredAt),
      platform: event.platform,
      appVersion: event.appVersion,
      osVersion: event.osVersion ?? null,
      direction: token
        ? token.role === 'host'
          ? 'outgoing'
          : 'incoming'
        : (event.direction ?? null),
      errorCode: event.errorCode ?? null,
      metricsJson,
    };
  }
}
