export interface ReelListItem {
  id: string;
  userId: string;
  mediaKey: string;
  title?: string;
  tags: string[];
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  visibility: 'public' | 'private';
  viewCount: number;
  thumbnailKey?: string;
  createdAt: string;
}

export interface ReelDetail extends ReelListItem {
  description?: string;
  transcript?: string;
}

export interface PaginatedReels<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}
