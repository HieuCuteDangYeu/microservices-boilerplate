import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { RecommendationMetadata } from '@common/recommendation/interfaces/recommendation-metadata.interface';

export type ReelVisibility = 'public' | 'friends' | 'private';

export interface ReelAuthorSummary {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean | null;
}

export interface ReelListItem {
  id: string;
  userId: string;
  mediaKey: string;
  title?: string;
  description?: string;
  tags: string[];
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  visibility: ReelVisibility;
  viewCount: number;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  processingStage?: string;
  processingMessage?: string;
  processingProgress?: number;
  streamUrl: string;
  createdAt: string;
  recommendation?: RecommendationMetadata;
}

export interface ReelDetail extends ReelListItem {
  transcript?: string;
  transcriptVtt?: string;
  transcriptSegments?: TranscriptSegment[];
}

export interface ReelFeedListItem extends ReelListItem {
  author: ReelAuthorSummary;
}

export interface PaginatedReels<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
  feedSessionId?: string;
  algorithmVersion?: string;
  generatedAt?: string;
}
