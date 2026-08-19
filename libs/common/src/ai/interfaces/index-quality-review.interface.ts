import type { ReelIndexDocumentKind } from '@common/processing/interfaces/reel-index-document.interface';

export type IndexQualityIssueCategory =
  | 'METADATA'
  | 'SECTIONING'
  | 'GROUNDING'
  | 'VISUAL_CONTEXT'
  | 'RETRIEVAL_QUALITY';

export type IndexQualityIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface IndexQualityReviewDocument {
  id: string;
  kind: ReelIndexDocumentKind;
  ordinal: number;
  parentId?: string;
  startTime?: number;
  endTime?: number;
  evidenceQuality: 'VERIFIED' | 'LOW_CONFIDENCE' | 'METADATA_ONLY';
  text: string;
}

export interface IndexQualityReviewRequest {
  reelId: string;
  sourceLengthClass: 'SHORT' | 'LONG';
  durationMs: number;
  title?: string;
  description?: string;
  tags: string[];
  documents: IndexQualityReviewDocument[];
}

export interface IndexQualityReviewIssue {
  category: IndexQualityIssueCategory;
  severity: IndexQualityIssueSeverity;
  message: string;
  documentId?: string;
}

export interface IndexQualityReviewResult {
  acceptable: boolean;
  confidence: number;
  summary: string;
  issues: IndexQualityReviewIssue[];
}
