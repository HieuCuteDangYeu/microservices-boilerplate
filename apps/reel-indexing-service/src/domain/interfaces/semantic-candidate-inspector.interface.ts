export interface SemanticCandidateSnapshot {
  reelDocumentCount: number;
  sectionCount: number;
  chunkCount: number;
  visualSceneCount: number;
  transcriptSegmentCount: number;
  activeDocumentCount: number;
}

export interface ISemanticCandidateInspector {
  getSnapshot(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<SemanticCandidateSnapshot>;
}
