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
  visibility: 'public' | 'private';
  viewCount: number;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  processingStage?: string;
  processingMessage?: string;
  processingProgress?: number;
  streamUrl: string;
  createdAt: string;
}

export interface ReelDetail extends ReelListItem {
  transcript?: string;
}

export interface ReelFeedListItem extends ReelListItem {
  author: ReelAuthorSummary;
}

export interface PaginatedReels<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}
