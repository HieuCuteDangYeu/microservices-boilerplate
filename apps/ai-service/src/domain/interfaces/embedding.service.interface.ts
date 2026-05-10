export interface IEmbeddingService {
  generateVector(text: string): Promise<number[]>;
}
