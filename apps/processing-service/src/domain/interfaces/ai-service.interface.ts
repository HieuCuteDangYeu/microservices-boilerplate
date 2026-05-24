import { GenerateEmbeddingRequest } from '@common/ai/interfaces/generate-embedding.interface';

export interface IAiService {
  generateEmbedding(input: GenerateEmbeddingRequest): Promise<number[]>;
  transcribeAudio(audioBuffer: Buffer): Promise<string>;
}
