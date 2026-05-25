import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
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

export interface ReelCursor {
  createdAt: Date;
  id: string;
}

export interface ReelProfileContextQuery {
  anchor: Reel;
  before: number;
  after: number;
}

export interface ReelProfileContextResult {
  items: Reel[];
  selectedIndex: number;
  previousCursor: ReelCursor | null;
  nextCursor: ReelCursor | null;
}

export interface IContentRepository {
  createReel(reel: Partial<Reel>): Promise<Reel>;
  updateReelStatus(
    id: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    transcriptVtt?: string,
    transcriptSegments?: TranscriptSegment[],
    embedding?: number[],
    thumbnailKey?: string,
    processingStage?: string,
    processingMessage?: string,
    processingProgress?: number,
  ): Promise<Reel>;
  findById(id: string): Promise<Reel | null>;
  searchReelContext(
    queryVector: number[],
    userId: string,
  ): Promise<ReelContextSearchResult[]>;
  listReels(query: ReelListQuery): Promise<{
    items: Reel[];
    nextCursor: ReelCursor | null;
  }>;
  getProfileReelContext(
    query: ReelProfileContextQuery,
  ): Promise<ReelProfileContextResult>;
  updateReel(
    id: string,
    data: ReelUpdateData,
    userId: string,
  ): Promise<Reel | null>;
  deleteReel(id: string, userId: string): Promise<boolean>;
  incrementViewCount(id: string): Promise<Reel | null>;
}
