import { GenerateEmbeddingRequest } from '@common/ai/interfaces/generate-embedding.interface';
import { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';

export interface TranscriptionOptions {
  initialPrompt?: string;
}

export interface IAiService {
  generateEmbedding(input: GenerateEmbeddingRequest): Promise<number[]>;
  transcribeAudio(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
}
