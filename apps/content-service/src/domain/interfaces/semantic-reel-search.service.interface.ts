export interface SemanticReelSearchCandidate {
  reelId: string;
  score: number;
}

export interface ISemanticReelSearchService {
  searchPublicReels(input: {
    query: string;
    limit: number;
  }): Promise<SemanticReelSearchCandidate[]>;
}
