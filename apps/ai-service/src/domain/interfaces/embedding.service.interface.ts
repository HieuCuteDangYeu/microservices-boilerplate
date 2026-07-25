import {
  GenerateEmbeddingRequest,
  GenerateEmbeddingResult,
} from '@common/ai/interfaces/generate-embedding.interface';

export interface IEmbeddingService {
  generateVector(
    input: GenerateEmbeddingRequest,
  ): Promise<GenerateEmbeddingResult>;

  countTokens(model: string, text: string): Promise<number>;
}
