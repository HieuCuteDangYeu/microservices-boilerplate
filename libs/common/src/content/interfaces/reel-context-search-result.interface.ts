export interface ReelContextSearchResult {
  chunkId: string;
  reelId: string;
  title?: string;
  description?: string;
  tags: string[];
  chunkText: string;
  startTime?: number | null;
  endTime?: number | null;
  distance: number | null;
  score?: number; // final retrieval score from content-service
  rerankScore?: number; // reranker score from ai-service
  vectorScore?: number;
  keywordScore?: number;
  metadataScore?: number;
  matchedBy?: 'VECTOR' | 'KEYWORD' | 'HYBRID';
}
