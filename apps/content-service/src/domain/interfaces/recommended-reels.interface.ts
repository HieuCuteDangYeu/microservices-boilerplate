import type { Reel } from '@content/domain/entities/reel.entity';
import type { ReelCursor } from '@content/domain/interfaces/content.repository.interface';

export interface GetRecommendedReelsInput {
  viewerId: string;
  limit?: number;
  cursor?: ReelCursor;
  excludeRecentlySeen?: boolean;
  feedSessionId?: string;
  excludedUserIds?: string[];
}

export interface RecommendedReelsResult {
  items: Reel[];
  nextCursor: ReelCursor | null;
  feedSessionId: string;
  algorithmVersion: string;
  generatedAt: string;
}
