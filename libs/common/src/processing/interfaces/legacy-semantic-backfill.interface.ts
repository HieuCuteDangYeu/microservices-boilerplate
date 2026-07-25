import type {
  ReelSourceLengthClass,
  ReelSourceOrientation,
} from '@common/content/interfaces/reel-state.interface';

export const LEGACY_SEMANTIC_BACKFILL_PATTERNS = {
  LIST_CONTENT_PAGE: 'content.list_legacy_semantic_reels',
  IMPORT_INDEX_PAGE: 'index.import_legacy_semantic_reels',
  GET_INDEX_STATUS: 'index.legacy_semantic_backfill_status',
} as const;

export interface LegacySemanticChunk {
  id: string;
  ordinal: number;
  text: string;
  startTime?: number;
  endTime?: number;
  embedding: number[];
  embeddingModel: string;
}

export interface LegacySemanticReel {
  reelId: string;
  userId: string;
  title?: string;
  description?: string;
  tags: string[];
  sourceDurationMs: number;
  sourceOrientation: ReelSourceOrientation;
  sourceLengthClass: ReelSourceLengthClass;
  chunks: LegacySemanticChunk[];
}

export interface LegacySemanticBackfillPage {
  items: LegacySemanticReel[];
  nextCursor?: string;
}
