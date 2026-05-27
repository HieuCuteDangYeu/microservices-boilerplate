import {
  GenerateEmbeddingRequest,
  GenerateEmbeddingResult,
} from '@common/ai/interfaces/generate-embedding.interface';

export interface IAiEmbeddingService {
  generateEmbedding(
    input: GenerateEmbeddingRequest,
  ): Promise<GenerateEmbeddingResult>;
}
