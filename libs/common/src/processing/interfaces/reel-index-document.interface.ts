export type ReelIndexDocumentKind = 'REEL' | 'SECTION' | 'CHUNK';

export interface ReelIndexDocument {
  id: string;
  reelId: string;
  kind: ReelIndexDocumentKind;
  ordinal: number;
  parentId?: string;
  text: string;
  startTime?: number;
  endTime?: number;
  embedding: number[];
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingVersion: string;
  embeddingInputHash: string;
  indexVersion: string;
  chunkingVersion: string;
  summaryVersion: string;
}

export interface EmbeddingCacheIdentity {
  cacheKey: string;
  stableItemId: string;
  documentKind: ReelIndexDocumentKind;
  embeddingInputHash: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingVersion: string;
  indexVersion: string;
  chunkingVersion: string;
  summaryVersion: string;
}

export interface CachedEmbedding extends EmbeddingCacheIdentity {
  embedding: number[];
}
