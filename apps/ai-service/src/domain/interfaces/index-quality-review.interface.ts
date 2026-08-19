export type IndexQualityIssueCategory =
  | 'METADATA'
  | 'SECTIONING'
  | 'GROUNDING'
  | 'VISUAL_CONTEXT'
  | 'RETRIEVAL_QUALITY';

export type IndexQualityIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type IndexQualityDocumentKind =
  | 'REEL'
  | 'SECTION'
  | 'CHUNK'
  | 'VISUAL_SCENE';

export type IndexQualityEvidenceQuality =
  | 'VERIFIED'
  | 'LOW_CONFIDENCE'
  | 'METADATA_ONLY';

export interface IndexQualityReviewDocument {
  id: string;
  kind: IndexQualityDocumentKind;
  ordinal: number;
  parentId?: string;
  startTime?: number;
  endTime?: number;
  evidenceQuality: IndexQualityEvidenceQuality;
  text: string;
}

export interface IndexQualityReviewInput {
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
