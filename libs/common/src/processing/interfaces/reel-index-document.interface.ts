export type ReelIndexDocumentKind = 'REEL' | 'SECTION' | 'CHUNK';
export type ReelEvidenceQuality =
  | 'VERIFIED'
  | 'LOW_CONFIDENCE'
  | 'METADATA_ONLY';

export interface ReelEvidenceDocument {
  id: string;
  reelId: string;
  parentId?: string;
  kind: ReelIndexDocumentKind;
  ordinal: number;
  evidenceText?: string;
  retrievalText: string;
  derivedSummary?: string;
  sourceSectionIds: string[];
  startTime?: number;
  endTime?: number;
  sourceSegmentIds: string[];
  sourceAudioArtifactIds: string[];
  evidenceHash?: string;
  retrievalHash: string;
  evidenceQuality: ReelEvidenceQuality;
  transcriptVersion?: string;
  sectioningVersion: string;
  chunkingVersion: string;
  summaryVersion: string;
  indexVersion: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingVersion: string;
  embeddingInputHash: string;
  embedding: number[];
  tokenCount: number;
}

// Retained as a source-compatible name while callers migrate to the
// evidence-specific contract.
export type ReelIndexDocument = ReelEvidenceDocument;

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

export interface ReelEvidenceDocumentDraft extends EmbeddingCacheIdentity {
  id: string;
  reelId: string;
  parentId?: string;
  kind: ReelIndexDocumentKind;
  ordinal: number;
  evidenceText?: string;
  retrievalText: string;
  derivedSummary?: string;
  sourceSectionIds: string[];
  startTime?: number;
  endTime?: number;
  sourceSegmentIds: string[];
  sourceAudioArtifactIds: string[];
  evidenceHash?: string;
  retrievalHash: string;
  evidenceQuality: ReelEvidenceQuality;
  transcriptVersion?: string;
  sectioningVersion: string;
  tokenCount?: number;
}

export interface CachedEmbedding extends EmbeddingCacheIdentity {
  embedding: number[];
}
