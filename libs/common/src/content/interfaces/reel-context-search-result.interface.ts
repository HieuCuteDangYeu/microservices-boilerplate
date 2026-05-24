export interface ReelContextSearchResult {
  reelId: string;
  title?: string;
  description?: string;
  tags: string[];
  transcript?: string;
  distance: number;
}
