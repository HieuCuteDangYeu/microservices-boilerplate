export type IndexQualityIssueCategory =
  | 'METADATA'
  | 'SECTIONING'
  | 'GROUNDING'
  | 'VISUAL_CONTEXT'
  | 'RETRIEVAL_QUALITY';

export type IndexQualityIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

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
