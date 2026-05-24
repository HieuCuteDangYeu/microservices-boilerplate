import { GenerateEmbeddingRequest } from '@common/ai/interfaces/generate-embedding.interface';

export interface IEmbeddingService {
  generateVector(input: GenerateEmbeddingRequest): Promise<number[]>;
}
