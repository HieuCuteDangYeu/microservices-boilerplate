export interface ReelContextSearchResult {
  chunkId: string;
  reelId: string;
  title?: string;
  description?: string;
  tags: string[];
  chunkText: string;
  startTime?: number;
  endTime?: number;
  distance: number | null;
  score?: number; // hybrid retrieval score from content-service
  rerankScore?: number; // reranker score from ai-service
  vectorScore?: number;
  keywordScore?: number;
  matchedBy?: 'VECTOR' | 'KEYWORD' | 'HYBRID';
}
