import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { ReelContextSearchRequest } from '@common/content/interfaces/reel-context-search-request.interface';
import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { Reel } from '../entities/reel.entity';

export interface ReelListQuery {
  userId?: string;
  visibility?: 'public' | 'private';
  limit?: number;
  cursor?: { createdAt: Date; id: string };
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

export interface ReelChunkBackfillCandidate {
  id: string;
  userId: string;
  title?: string;
  description?: string;
  tags: string[];
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  createdAt: Date;
}

export interface ReelChunkBackfillCursor {
  createdAt: Date;
  id: string;
}

export interface ReelChunkBackfillPage {
  items: ReelChunkBackfillCandidate[];
  nextCursor: ReelChunkBackfillCursor | null;
}

export interface IContentRepository {
  createReel(reel: Partial<Reel>): Promise<Reel>;

  updateReelStatus(
    id: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    transcript?: string,
    transcriptVtt?: string,
    transcriptSegments?: TranscriptSegment[],
    thumbnailKey?: string,
    processingStage?: string,
    processingMessage?: string,
    processingProgress?: number,
    chunks?: ReelChunkIndexInput[],
  ): Promise<Reel>;

  findById(id: string): Promise<Reel | null>;

  searchReelContext(
    input: ReelContextSearchRequest,
  ): Promise<ReelContextSearchResult[]>;

  findReelsForChunkBackfill(
    limit: number,
    cursor?: ReelChunkBackfillCursor,
    reelId?: string,
  ): Promise<ReelChunkBackfillPage>;

  replaceReelChunks(
    reelId: string,
    userId: string,
    chunks: ReelChunkIndexInput[],
  ): Promise<void>;

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
