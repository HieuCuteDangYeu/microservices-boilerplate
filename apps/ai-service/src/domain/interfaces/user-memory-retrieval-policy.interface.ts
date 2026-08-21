export interface IUserMemoryRetrievalPolicy {
  semanticRetrievalEnabled: boolean;
  expectedEmbeddingDimensions: number;
  minSemanticScore: number;
  minConfidence: number;
}
