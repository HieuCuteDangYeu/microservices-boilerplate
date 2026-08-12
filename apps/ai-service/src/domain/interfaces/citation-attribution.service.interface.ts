export type CitationEvidenceType = 'TRANSCRIPT' | 'VISUAL' | 'METADATA';

export interface CitationAttributionCandidate {
  evidenceId: string;
  reelId: string;
  evidenceType: CitationEvidenceType;
  evidenceText: string;
  title?: string;
  startTime?: number;
  endTime?: number;
}

export interface CitationAttributionSelection {
  evidenceId: string;
  confidence: number;
}

export interface CitationClaimAssessment {
  claim: string;
  supported: boolean;
  evidenceIds: string[];
  confidence: number;
}

export interface CitationAttributionResult {
  selections: CitationAttributionSelection[];
  claims: CitationClaimAssessment[];
  factualClaimCount: number;
  supportedClaimCount: number;
  coverage: number;
}

export interface ICitationAttributionService {
  attribute(input: {
    question: string;
    answer: string;
    candidates: CitationAttributionCandidate[];
    maxCitations: number;
  }): Promise<CitationAttributionResult>;
}
