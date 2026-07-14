import type {
  RecommendationOutcome,
  RecommendationType,
} from '@common/recommendation/interfaces/recommendation-metadata.interface';

export interface RecommendationTelemetrySummaryQuery {
  from: string;
  to: string;
  recommendationType?: RecommendationType;
  algorithmVersion?: string;
  candidateSource?: string;
}

export interface RecommendationTelemetryTotals {
  requests: number;
  succeeded: number;
  failed: number;
  emptyResponses: number;
  requestedItems: number;
  returnedItems: number;
  averageReturnedItems: number | null;
  successRate: number | null;
  failureRate: number | null;
  emptyResponseRate: number | null;
  fillRate: number | null;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface RecommendationTelemetryTypeBreakdown {
  recommendationType: RecommendationType;
  requests: number;
  succeeded: number;
  failed: number;
  returnedItems: number;
  averageLatencyMs: number | null;
}

export interface RecommendationTelemetryVersionBreakdown {
  recommendationType: RecommendationType;
  algorithmVersion: string;
  requests: number;
  succeeded: number;
  failed: number;
  returnedItems: number;
  averageLatencyMs: number | null;
}

export interface RecommendationTelemetrySourceBreakdown {
  recommendationType: RecommendationType;
  candidateSource: string;
  requests: number;
  returnedItems: number;
  averageLatencyMs: number | null;
}

export interface RecommendationTelemetryFailureBreakdown {
  recommendationType: RecommendationType;
  errorCode: string;
  requests: number;
}

export interface RecommendationTelemetryOutcomeBreakdown {
  recommendationType: RecommendationType;
  outcome: RecommendationOutcome;
  requests: number;
}

export interface RecommendationTelemetrySummary {
  range: {
    from: string;
    to: string;
  };
  filters: {
    recommendationType: RecommendationType | null;
    algorithmVersion: string | null;
    candidateSource: string | null;
  };
  totals: RecommendationTelemetryTotals;
  byRecommendationType: RecommendationTelemetryTypeBreakdown[];
  byAlgorithmVersion: RecommendationTelemetryVersionBreakdown[];
  byCandidateSource: RecommendationTelemetrySourceBreakdown[];
  byOutcome: RecommendationTelemetryOutcomeBreakdown[];
  failures: RecommendationTelemetryFailureBreakdown[];
}
