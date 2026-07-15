import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type CallTelemetryEvent as PrismaCallTelemetryEvent,
} from '@prisma/monitoring-client';
import type { ICallTelemetryRepository } from '../../domain/interfaces/call-telemetry.repository.interface';
import type {
  CallTelemetryTimelineEvent,
  RecentCallLeg,
  StoredCallTelemetryEvent,
  TelemetryDirection,
  TelemetryEventType,
  TelemetryJsonObject,
  TelemetryOutcome,
  TelemetryQuery,
  TelemetryRole,
} from '../../domain/models/call-telemetry.model';
import { MonitoringPrismaService } from '../prisma/monitoring-prisma.service';

@Injectable()
export class PrismaCallTelemetryRepository implements ICallTelemetryRepository {
  constructor(private readonly prisma: MonitoringPrismaService) {}

  async create(events: StoredCallTelemetryEvent[]): Promise<number> {
    const result = await this.prisma.callTelemetryEvent.createMany({
      data: events.map((event) => ({
        ...event,
        metricsJson: event.metricsJson
          ? (event.metricsJson as Prisma.InputJsonObject)
          : Prisma.DbNull,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async findEvents(query: TelemetryQuery): Promise<StoredCallTelemetryEvent[]> {
    const events = await this.prisma.callTelemetryEvent.findMany({
      where: this.toEventWhere(query),
    });

    return events.map((event) => this.toStoredEvent(event));
  }

  async findTimeline(callId: string): Promise<CallTelemetryTimelineEvent[]> {
    const events = await this.prisma.callTelemetryEvent.findMany({
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

    return events.map((event) => ({
      ...event,
      role: event.role as TelemetryRole | null,
      eventType: event.eventType as TelemetryEventType,
      outcome: event.outcome as TelemetryOutcome | null,
      platform: event.platform as StoredCallTelemetryEvent['platform'],
      direction: event.direction as TelemetryDirection | null,
      metricsJson: this.toMetricsJson(event.metricsJson),
    }));
  }

  async findRecentCallLegs(query: TelemetryQuery): Promise<RecentCallLeg[]> {
    const groups = await this.prisma.callTelemetryEvent.groupBy({
      by: [
        'callId',
        'attemptId',
        'role',
        'platform',
        'appVersion',
        'direction',
      ],
      where: {
        ...this.toEventWhere(query),
        callId: { not: null },
      },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
      orderBy: { _max: { occurredAt: 'desc' } },
      take: 50,
    });

    if (groups.length === 0) {
      return [];
    }

    const events = await this.prisma.callTelemetryEvent.findMany({
      where: {
        ...this.toEventWhere(query),
        OR: groups.map((group) => ({
          callId: group.callId!,
          attemptId: group.attemptId,
        })),
      },
      select: {
        callId: true,
        attemptId: true,
        role: true,
        stage: true,
        outcome: true,
        errorCode: true,
        occurredAt: true,
        platform: true,
        appVersion: true,
        direction: true,
      },
      orderBy: { occurredAt: 'asc' },
    });

    return groups.map((group) => {
      const legEvents = events.filter(
        (event) =>
          event.callId === group.callId &&
          event.attemptId === group.attemptId &&
          event.role === group.role &&
          event.platform === group.platform &&
          event.appVersion === group.appVersion &&
          event.direction === group.direction,
      );
      const failure = [...legEvents]
        .reverse()
        .find((event) => event.outcome === 'failed');

      return {
        callId: group.callId!,
        attemptId: group.attemptId,
        role: group.role as TelemetryRole | null,
        platform: group.platform as StoredCallTelemetryEvent['platform'],
        appVersion: group.appVersion,
        direction: group.direction as TelemetryDirection | null,
        startedAt: group._min.occurredAt!,
        lastOccurredAt: group._max.occurredAt!,
        controlPlaneActive: legEvents.some(
          (event) =>
            event.stage === 'control_plane_active' &&
            event.outcome === 'succeeded',
        ),
        mediaReady: legEvents.some(
          (event) =>
            event.stage === 'media_ready' && event.outcome === 'succeeded',
        ),
        failure: failure
          ? { stage: failure.stage, errorCode: failure.errorCode }
          : null,
      };
    });
  }

  async deleteReceivedBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.callTelemetryEvent.deleteMany({
      where: { receivedAt: { lt: cutoff } },
    });

    return result.count;
  }

  private toEventWhere(
    query: TelemetryQuery,
  ): Prisma.CallTelemetryEventWhereInput {
    return {
      occurredAt: { gte: new Date(query.from), lte: new Date(query.to) },
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.osVersion ? { osVersion: query.osVersion } : {}),
      ...(query.appVersion ? { appVersion: query.appVersion } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
    };
  }

  private toStoredEvent(
    event: PrismaCallTelemetryEvent,
  ): StoredCallTelemetryEvent {
    return {
      eventId: event.eventId,
      attemptId: event.attemptId,
      callId: event.callId,
      role: event.role as TelemetryRole | null,
      eventType: event.eventType as TelemetryEventType,
      stage: event.stage,
      outcome: event.outcome as TelemetryOutcome | null,
      elapsedMs: event.elapsedMs,
      occurredAt: event.occurredAt,
      platform: event.platform as StoredCallTelemetryEvent['platform'],
      appVersion: event.appVersion,
      osVersion: event.osVersion,
      direction: event.direction as TelemetryDirection | null,
      errorCode: event.errorCode,
      metricsJson: this.toMetricsJson(event.metricsJson),
    };
  }

  private toMetricsJson(
    value: Prisma.JsonValue | null,
  ): TelemetryJsonObject | null {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }

    return value as TelemetryJsonObject;
  }
}
