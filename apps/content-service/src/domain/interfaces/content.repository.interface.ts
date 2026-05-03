import { TranscriptSearchResult } from '@common/content/interfaces/transcript-search-result.interface';
import { Reel } from '../entities/reel.entity';

export interface ReelListQuery {
  userId?: string;
  visibility?: 'public' | 'private';
  limit?: number;
  cursor?: { createdAt: Date; id: string };
  /** When true, only returns COMPLETED reels (use for public feed). */
  onlyPublished?: boolean;
}

export interface ReelUpdateData {
  title?: string;
  description?: string;
  tags?: string[];
  visibility?: 'public' | 'private';
}

export interface IContentRepository {
  createReel(reel: Partial<Reel>): Promise<Reel>;
  updateReelStatus(
    id: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    embedding?: number[],
    thumbnailKey?: string,
  ): Promise<Reel>;
  findById(id: string): Promise<Reel | null>;
  searchTranscripts(queryVector: number[]): Promise<TranscriptSearchResult[]>;
  listReels(query: ReelListQuery): Promise<{
    items: Reel[];
    nextCursor: { createdAt: Date; id: string } | null;
  }>;
  updateReel(
    id: string,
    data: ReelUpdateData,
    userId: string,
  ): Promise<Reel | null>;
  deleteReel(id: string, userId: string): Promise<boolean>;
  incrementViewCount(id: string): Promise<Reel | null>;
}
