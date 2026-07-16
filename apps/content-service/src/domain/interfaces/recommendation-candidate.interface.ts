import type { Reel } from '@content/domain/entities/reel.entity';
import type { ReelCursor } from '@content/domain/interfaces/content.repository.interface';

export const RECOMMENDATION_CANDIDATE_SOURCES = [
  'RECENT_QUALITY',
  'TRENDING',
  'TAG_AFFINITY',
  'CREATOR_AFFINITY',
  'CONTENT_SIMILARITY',
  'SOCIAL',
  'EXPLORATION',
] as const;

export type RecommendationCandidateSource =
  (typeof RECOMMENDATION_CANDIDATE_SOURCES)[number];

export interface RecommendationCandidateEvidence {
  reelId: string;
  source: RecommendationCandidateSource;
  sourceScore: number;
  reasons: string[];
}

export interface MergedRecommendationCandidate {
  reelId: string;
  primarySource: RecommendationCandidateSource;
  sources: RecommendationCandidateSource[];
  sourceScores: Partial<Record<RecommendationCandidateSource, number>>;
  reasons: string[];
  score: number;
}

export interface CandidateSourceInput {
  viewerId: string;
  limit: number;
  cursor?: ReelCursor;
  excludedUserIds: string[];
  friendUserIds: string[];
}

export interface GenerateRecommendationCandidatesInput {
  viewerId: string;
  limit: number;
  cursor?: ReelCursor;
  excludedUserIds: string[];
  friendUserIds: string[];
  excludeRecentlySeen?: boolean;
}

export interface GeneratedRecommendationItem {
  reel: Reel;
  candidate: MergedRecommendationCandidate;
}

export interface GenerateRecommendationCandidatesResult {
  items: GeneratedRecommendationItem[];
  nextCursor: ReelCursor | null;
  rawCandidateCount: number;
  deduplicatedCandidateCount: number;
  sourceCounts: Partial<Record<RecommendationCandidateSource, number>>;
}
