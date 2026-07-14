import type { RecommendationTelemetryEvent } from '@monitoring/domain/entities/recommendation-telemetry-event.entity';
import type {
  IRecommendationTelemetryRepository,
  RecommendationTelemetryQuery,
  RecommendationTelemetrySummaryResult,
} from '@monitoring/domain/interfaces/recommendation-telemetry.repository.interface';
import { PrismaService } from '@monitoring/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/monitoring-client';

interface TotalsRow {
  requests: number;
  succeeded: number;
  failed: number;
  emptyResponses: number;
  requestedItems: number;
  returnedItems: number;
  averageReturnedItems: number | null;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

interface TypeRow {
  recommendationType: 'REEL' | 'USER';
  requests: number;
  succeeded: number;
  failed: number;
  returnedItems: number;
  averageLatencyMs: number | null;
}

interface VersionRow extends TypeRow {
  algorithmVersion: string;
}

interface SourceRow {
  recommendationType: 'REEL' | 'USER';
  candidateSource: string;
  requests: number;
  returnedItems: number;
  averageLatencyMs: number | null;
}

interface OutcomeRow {
  recommendationType: 'REEL' | 'USER';
  outcome: 'SUCCEEDED' | 'FAILED';
  requests: number;
}

interface FailureRow {
  recommendationType: 'REEL' | 'USER';
  errorCode: string;
  requests: number;
}

@Injectable()
export class RecommendationTelemetryRepository implements IRecommendationTelemetryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(events: RecommendationTelemetryEvent[]): Promise<number> {
    const result = await this.prisma.recommendationTelemetryEvent.createMany({
      data: events.map((event) => ({
        eventId: event.eventId,
        recommendationType: event.recommendationType,
        algorithmVersion: event.algorithmVersion,
        feedSessionId: event.feedSessionId,
        route: event.route,
        candidateSource: event.candidateSource,
        requestedLimit: event.requestedLimit,
        returnedItems: event.returnedItems,
        latencyMs: event.latencyMs,
        outcome: event.outcome,
        errorCode: event.errorCode,
        featureFlags: event.featureFlags,
        occurredAt: event.occurredAt,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async getSummary(
    query: RecommendationTelemetryQuery,
  ): Promise<RecommendationTelemetrySummaryResult> {
    const where = this.buildWhere(query);

    const failureWhere = Prisma.sql`
      ${where}
      AND "outcome" = 'FAILED'
    `;

    const [
      totalsRows,
      typeRows,
      versionRows,
      sourceRows,
      outcomeRows,
      failureRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<TotalsRow[]>(
        Prisma.sql`
          SELECT
            COUNT(*)::int AS "requests",
            (
              COUNT(*) FILTER (
                WHERE "outcome" = 'SUCCEEDED'
              )
            )::int AS "succeeded",
            (
              COUNT(*) FILTER (
                WHERE "outcome" = 'FAILED'
              )
            )::int AS "failed",
            (
              COUNT(*) FILTER (
                WHERE
                  "outcome" = 'SUCCEEDED'
                  AND "returned_items" = 0
              )
            )::int AS "emptyResponses",
            COALESCE(
              SUM("requested_limit"),
              0
            )::double precision AS "requestedItems",
            COALESCE(
              SUM("returned_items"),
              0
            )::double precision AS "returnedItems",
            (
              AVG("returned_items") FILTER (
                WHERE "outcome" = 'SUCCEEDED'
              )
            )::double precision AS "averageReturnedItems",
            AVG(
              "latency_ms"
            )::double precision AS "averageLatencyMs",
            percentile_cont(0.5)
              WITHIN GROUP (
                ORDER BY "latency_ms"
              )::double precision AS "p50LatencyMs",
            percentile_cont(0.95)
              WITHIN GROUP (
                ORDER BY "latency_ms"
              )::double precision AS "p95LatencyMs"
          FROM "recommendation_telemetry_events"
          ${where}
        `,
      ),
      this.prisma.$queryRaw<TypeRow[]>(
        Prisma.sql`
          SELECT
            "recommendation_type"
              AS "recommendationType",
            COUNT(*)::int AS "requests",
            (
              COUNT(*) FILTER (
                WHERE "outcome" = 'SUCCEEDED'
              )
            )::int AS "succeeded",
            (
              COUNT(*) FILTER (
                WHERE "outcome" = 'FAILED'
              )
            )::int AS "failed",
            COALESCE(
              SUM("returned_items"),
              0
            )::double precision AS "returnedItems",
            AVG(
              "latency_ms"
            )::double precision AS "averageLatencyMs"
          FROM "recommendation_telemetry_events"
          ${where}
          GROUP BY "recommendation_type"
          ORDER BY "recommendation_type" ASC
        `,
      ),
      this.prisma.$queryRaw<VersionRow[]>(
        Prisma.sql`
          SELECT
            "recommendation_type"
              AS "recommendationType",
            "algorithm_version"
              AS "algorithmVersion",
            COUNT(*)::int AS "requests",
            (
              COUNT(*) FILTER (
                WHERE "outcome" = 'SUCCEEDED'
              )
            )::int AS "succeeded",
            (
              COUNT(*) FILTER (
                WHERE "outcome" = 'FAILED'
              )
            )::int AS "failed",
            COALESCE(
              SUM("returned_items"),
              0
            )::double precision AS "returnedItems",
            AVG(
              "latency_ms"
            )::double precision AS "averageLatencyMs"
          FROM "recommendation_telemetry_events"
          ${where}
          GROUP BY
            "recommendation_type",
            "algorithm_version"
          ORDER BY "requests" DESC
        `,
      ),
      this.prisma.$queryRaw<SourceRow[]>(
        Prisma.sql`
          SELECT
            "recommendation_type"
              AS "recommendationType",
            "candidate_source"
              AS "candidateSource",
            COUNT(*)::int AS "requests",
            COALESCE(
              SUM("returned_items"),
              0
            )::double precision AS "returnedItems",
            AVG(
              "latency_ms"
            )::double precision AS "averageLatencyMs"
          FROM "recommendation_telemetry_events"
          ${where}
          GROUP BY
            "recommendation_type",
            "candidate_source"
          ORDER BY "requests" DESC
        `,
      ),
      this.prisma.$queryRaw<OutcomeRow[]>(
        Prisma.sql`
          SELECT
            "recommendation_type"
              AS "recommendationType",
            "outcome" AS "outcome",
            COUNT(*)::int AS "requests"
          FROM "recommendation_telemetry_events"
          ${where}
          GROUP BY
            "recommendation_type",
            "outcome"
          ORDER BY "requests" DESC
        `,
      ),
      this.prisma.$queryRaw<FailureRow[]>(
        Prisma.sql`
          SELECT
            "recommendation_type"
              AS "recommendationType",
            COALESCE(
              "error_code",
              'UNKNOWN_ERROR'
            ) AS "errorCode",
            COUNT(*)::int AS "requests"
          FROM "recommendation_telemetry_events"
          ${failureWhere}
          GROUP BY
            "recommendation_type",
            COALESCE(
              "error_code",
              'UNKNOWN_ERROR'
            )
          ORDER BY "requests" DESC
        `,
      ),
    ]);

    const totals = totalsRows[0] ?? this.emptyTotals();

    return {
      range: {
        from: query.from.toISOString(),
        to: query.to.toISOString(),
      },
      filters: {
        recommendationType: query.recommendationType ?? null,
        algorithmVersion: query.algorithmVersion ?? null,
        candidateSource: query.candidateSource ?? null,
      },
      totals: {
        requests: this.number(totals.requests),
        succeeded: this.number(totals.succeeded),
        failed: this.number(totals.failed),
        emptyResponses: this.number(totals.emptyResponses),
        requestedItems: this.number(totals.requestedItems),
        returnedItems: this.number(totals.returnedItems),
        averageReturnedItems: this.roundNullable(totals.averageReturnedItems),
        successRate: this.rate(totals.succeeded, totals.requests),
        failureRate: this.rate(totals.failed, totals.requests),
        emptyResponseRate: this.rate(totals.emptyResponses, totals.succeeded),
        fillRate: this.rate(totals.returnedItems, totals.requestedItems),
        averageLatencyMs: this.roundNullable(totals.averageLatencyMs),
        p50LatencyMs: this.roundNullable(totals.p50LatencyMs),
        p95LatencyMs: this.roundNullable(totals.p95LatencyMs),
      },
      byRecommendationType: typeRows.map((row) => ({
        recommendationType: row.recommendationType,
        requests: this.number(row.requests),
        succeeded: this.number(row.succeeded),
        failed: this.number(row.failed),
        returnedItems: this.number(row.returnedItems),
        averageLatencyMs: this.roundNullable(row.averageLatencyMs),
      })),
      byAlgorithmVersion: versionRows.map((row) => ({
        recommendationType: row.recommendationType,
        algorithmVersion: row.algorithmVersion,
        requests: this.number(row.requests),
        succeeded: this.number(row.succeeded),
        failed: this.number(row.failed),
        returnedItems: this.number(row.returnedItems),
        averageLatencyMs: this.roundNullable(row.averageLatencyMs),
      })),
      byCandidateSource: sourceRows.map((row) => ({
        recommendationType: row.recommendationType,
        candidateSource: row.candidateSource,
        requests: this.number(row.requests),
        returnedItems: this.number(row.returnedItems),
        averageLatencyMs: this.roundNullable(row.averageLatencyMs),
      })),
      byOutcome: outcomeRows.map((row) => ({
        recommendationType: row.recommendationType,
        outcome: row.outcome,
        requests: this.number(row.requests),
      })),
      failures: failureRows.map((row) => ({
        recommendationType: row.recommendationType,
        errorCode: row.errorCode,
        requests: this.number(row.requests),
      })),
    };
  }

  async deleteReceivedBefore(date: Date): Promise<number> {
    const result = await this.prisma.recommendationTelemetryEvent.deleteMany({
      where: {
        receivedAt: {
          lt: date,
        },
      },
    });

    return result.count;
  }

  private buildWhere(query: RecommendationTelemetryQuery): Prisma.Sql {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`
        "occurred_at" >= ${query.from}
      `,
      Prisma.sql`
        "occurred_at" <= ${query.to}
      `,
    ];

    if (query.recommendationType) {
      clauses.push(
        Prisma.sql`
          "recommendation_type" =
          ${query.recommendationType}
        `,
      );
    }

    if (query.algorithmVersion) {
      clauses.push(
        Prisma.sql`
          "algorithm_version" =
          ${query.algorithmVersion}
        `,
      );
    }

    if (query.candidateSource) {
      clauses.push(
        Prisma.sql`
          "candidate_source" =
          ${query.candidateSource}
        `,
      );
    }

    return Prisma.sql`
      WHERE ${Prisma.join(clauses, ' AND ')}
    `;
  }

  private emptyTotals(): TotalsRow {
    return {
      requests: 0,
      succeeded: 0,
      failed: 0,
      emptyResponses: 0,
      requestedItems: 0,
      returnedItems: 0,
      averageReturnedItems: null,
      averageLatencyMs: null,
      p50LatencyMs: null,
      p95LatencyMs: null,
    };
  }

  private rate(numerator: unknown, denominator: unknown): number | null {
    const normalizedDenominator = this.number(denominator);

    if (normalizedDenominator === 0) {
      return null;
    }

    return this.round(this.number(numerator) / normalizedDenominator);
  }

  private roundNullable(value: unknown): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    return this.round(this.number(value));
  }

  private round(value: number): number {
    return Math.round(value * 10_000) / 10_000;
  }

  private number(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'bigint') {
      return Number(value);
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }
}
