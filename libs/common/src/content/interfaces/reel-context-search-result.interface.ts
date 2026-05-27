export interface ReelContextSearchResult {
  chunkId: string;
  reelId: string;
  title?: string;
  description?: string;
  tags: string[];
  chunkText: string;
  startTime?: number;
  endTime?: number;
  distance: number;
}
