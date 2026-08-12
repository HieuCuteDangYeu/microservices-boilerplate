export interface SemanticCandidateActivation {
  previousIndexAttemptId?: string;
}

export interface ISemanticCandidateLifecycle {
  activateCandidate(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<SemanticCandidateActivation>;

  rollbackCandidate(input: {
    reelId: string;
    indexAttemptId: string;
    previousIndexAttemptId?: string;
  }): Promise<void>;

  finalizeCandidate(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<void>;

  discardCandidate(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<void>;
}
