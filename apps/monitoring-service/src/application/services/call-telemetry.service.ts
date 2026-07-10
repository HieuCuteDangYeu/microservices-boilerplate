import { CallTelemetryEventPayload } from '@common/calls/dtos/call-telemetry.dto';
import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/monitoring-client';
import { CallTelemetryTokenService } from '@common/calls/call-telemetry-token.service';

type TelemetryQuery = {
  from: string;
  to: string;
  platform?: string;
  osVersion?: string;
  appVersion?: string;
  direction?: string;
};

@Injectable()
export class CallTelemetryService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly tokenService: CallTelemetryTokenService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async ingest(events: CallTelemetryEventPayload[]) {
    const data = events.map((event) => {
      const token = event.telemetryToken
        ? this.tokenService.verify(event.telemetryToken)
        : null;
      if (event.telemetryToken && !token) {
        throw new BadRequestException('Invalid call telemetry token');
      }
      const {
        telemetryToken: _telemetryToken,
        metrics,
        details,
        ...safeEvent
      } = event;

      return {
        eventId: safeEvent.eventId,
        attemptId: safeEvent.attemptId,
        callId: token?.callId,
        role: token?.role,
        eventType: safeEvent.eventType,
        stage: safeEvent.stage,
        outcome: safeEvent.outcome,
        elapsedMs: Math.round(safeEvent.elapsedMs),
        occurredAt: new Date(safeEvent.occurredAt),
        platform: safeEvent.platform,
        appVersion: safeEvent.appVersion,
        osVersion: safeEvent.osVersion,
        direction: token
          ? token.role === 'host'
            ? 'outgoing'
            : 'incoming'
          : safeEvent.direction,
        errorCode: safeEvent.errorCode,
        metricsJson:
          metrics || details
            ? {
                ...metrics,
                ...(details ? { details } : {}),
              }
            : undefined,
      };
    });

    const result = await this.callTelemetryEvent.createMany({
      data,
      skipDuplicates: true,
    });
    return { accepted: result.count };
  }

  async summary(query: TelemetryQuery) {
    const events = await this.findEvents(query);
    const setupSucceeded = events.filter(
      (event) =>
        event.stage === 'control_plane_active' && event.outcome === 'succeeded',
    );
    const mediaReady = events.filter(
      (event) => event.stage === 'media_ready' && event.outcome === 'succeeded',
    );
    const attempts = new Set(events.map((event) => event.attemptId));
    const failures = events.filter((event) => event.outcome === 'failed');
    const quality = events.filter(
      (event) => event.eventType === 'quality_sample',
    );

    return {
      attempts: attempts.size,
      controlPlaneSuccessRate: rate(setupSucceeded.length, attempts.size),
      mediaReadySuccessRate: rate(mediaReady.length, attempts.size),
      timeToControlPlaneActiveMs: percentiles(
        setupSucceeded.map((event) => event.elapsedMs),
      ),
      timeToFirstRemoteAudioMs: percentiles(
        mediaReady.map((event) => event.elapsedMs),
      ),
      failures: countBy(
        failures,
        (event) => `${event.stage}:${event.errorCode ?? 'unknown'}`,
      ),
      quality: {
        samples: quality.length,
        packetLossRate: averageMetric(quality, 'packetLossRate'),
        jitterMs: averageMetric(quality, 'jitterMs'),
        roundTripTimeMs: averageMetric(quality, 'roundTripTimeMs'),
        concealmentRate: averageMetric(quality, 'concealmentRate'),
        jitterBufferDelayMs: averageMetric(quality, 'jitterBufferDelayMs'),
        badSampleRate: rate(
          quality.filter((event) => isBadQualitySample(event.metricsJson))
            .length,
          quality.length,
        ),
      },
    };
  }

  async callTimeline(callId: string) {
    return this.callTelemetryEvent.findMany({
      where: { callId },
      orderBy: { occurredAt: 'asc' },
      select: {
        eventId: true,
        attemptId: true,
        role: true,
        eventType: true,
        stage: true,
        outcome: true,
        elapsedMs: true,
        occurredAt: true,
        platform: true,
        appVersion: true,
        osVersion: true,
        direction: true,
        errorCode: true,
        metricsJson: true,
      },
    });
  }

  @Cron('0 0 * * *', { timeZone: 'UTC' })
  async removeExpiredEvents() {
    await this.callTelemetryEvent.deleteMany({
      where: {
        receivedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    });
  }

  private findEvents(query: TelemetryQuery) {
    return this.callTelemetryEvent.findMany({
      where: {
        occurredAt: { gte: new Date(query.from), lte: new Date(query.to) },
        ...(query.platform ? { platform: query.platform } : {}),
        ...(query.osVersion ? { osVersion: query.osVersion } : {}),
        ...(query.appVersion ? { appVersion: query.appVersion } : {}),
        ...(query.direction ? { direction: query.direction } : {}),
      },
    });
  }
}

const rate = (numerator: number, denominator: number) =>
  denominator === 0 ? null : numerator / denominator;

const percentiles = (values: number[]) => {
  if (values.length === 0) return { p50: null, p95: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (percentile: number) =>
    sorted[
      Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)
    ];
  return { p50: at(0.5), p95: at(0.95) };
};

const countBy = <T>(values: T[], key: (value: T) => string) =>
  values.reduce<Record<string, number>>((counts, value) => {
    const name = key(value);
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});

const averageMetric = (events: { metricsJson: unknown }[], key: string) => {
  const values = events
    .map(
      (event) => (event.metricsJson as Record<string, unknown> | null)?.[key],
    )
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value),
    );
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
};

const isBadQualitySample = (metrics: unknown) => {
  const value = metrics as Record<string, unknown> | null;
  return (
    (typeof value?.packetLossRate === 'number' &&
      value.packetLossRate >= 0.05) ||
    (typeof value?.roundTripTimeMs === 'number' &&
      value.roundTripTimeMs >= 400) ||
    (typeof value?.jitterMs === 'number' && value.jitterMs >= 50) ||
    (typeof value?.concealmentRate === 'number' &&
      value.concealmentRate >= 0.03)
  );
};
