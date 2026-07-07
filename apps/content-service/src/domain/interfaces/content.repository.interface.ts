import { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import { ReelChunkIndexInput } from '@common/content/interfaces/reel-chunk-index.interface';
import { ReelContextSearchRequest } from '@common/content/interfaces/reel-context-search-request.interface';
import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { ReelShareLink } from '../entities/reel-share-link.entity';
import { ReelShare } from '../entities/reel-share.entity';
import { Reel } from '../entities/reel.entity';

export interface ReelProcessingMediaMetadata {
  sourceDurationMs?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceFps?: number;
  sourceBitrateKbps?: number;
  sourceHasAudio?: boolean;
  sourceRotation?: number;
  encodedVariantCount?: number;
  encodedMaxHeight?: number;
  encodedFps?: number;
}

export interface ReelListQuery {
  userId?: string;
  viewerId?: string;
  visibility?: 'public' | 'private';
  limit?: number;
  cursor?: { createdAt: Date; id: string };
  onlyPublished?: boolean;
  ranked?: boolean;
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

export interface ReelShareCreateInput {
  reelId: string;
  ownerId: string;
  sharedByUserId: string;
  sharedWithUserId?: string | null;
  conversationId: string;
  messageId?: string | null;
}

export interface ReelShareLinkCreateInput {
  reelId: string;
  ownerId: string;
  token: string;
  createdBy: string;
  expiresAt?: Date | null;
}

export interface ReelShareLinkWithReel {
  link: ReelShareLink;
  reel: Reel;
}

export interface ReelViewEventInput {
  reelId: string;
  userId: string;
  sessionId?: string;
  eventType:
    | 'IMPRESSION'
    | 'WATCH_START'
    | 'WATCH_PROGRESS'
    | 'WATCH_END'
    | 'SKIP'
    | 'COMPLETE'
    | 'REPLAY'
    | 'PAUSE'
    | 'RESUME'
    | 'MUTE'
    | 'UNMUTE';
  watchMs?: number;
  durationMs?: number;
  percentageWatched?: number;
  muted?: boolean;
  completed?: boolean;
  replayed?: boolean;
  skipped?: boolean;
}

export interface ReelSearchQuery {
  query: string;
  viewerId?: string;
  limit?: number;
}

export interface ReelSearchResult {
  reel: Reel;
  score: number;
}

export interface IContentRepository {
  createReel(reel: Partial<Reel>): Promise<Reel>;

  queueReelProcessingAttempt(
    reelId: string,
    processingAttemptId: string,
  ): Promise<Reel>;

  claimProcessingAttempt(input: {
    reelId: string;
    processingAttemptId: string;
  }): Promise<boolean>;

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
    title?: string,
    description?: string,
    tags?: string[],
    expectedProcessingAttemptId?: string,
    processingErrorCode?: string,
    processingErrorDetail?: string,
    mediaMetadata?: ReelProcessingMediaMetadata,
  ): Promise<Reel>;

  findById(id: string): Promise<Reel | null>;

  shareReel(input: ReelShareCreateInput): Promise<ReelShare>;

  updateReelShareMessageId(
    shareId: string,
    messageId: string,
  ): Promise<ReelShare>;

  createReelShareLink(input: ReelShareLinkCreateInput): Promise<ReelShareLink>;

  findActiveReelShareLinkByReelAndCreator(input: {
    reelId: string;
    createdBy: string;
    now: Date;
  }): Promise<ReelShareLink | null>;

  findReelShareLinkByToken(
    token: string,
  ): Promise<ReelShareLinkWithReel | null>;

  incrementReelShareLinkClickCount(id: string): Promise<ReelShareLink>;

  revokeReelShareLink(input: {
    token: string;
    revokedByUserId: string;
  }): Promise<ReelShareLink | null>;

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

  searchPublicReels(query: ReelSearchQuery): Promise<ReelSearchResult[]>;

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

  trackReelEvents(events: ReelViewEventInput[]): Promise<void>;
}
