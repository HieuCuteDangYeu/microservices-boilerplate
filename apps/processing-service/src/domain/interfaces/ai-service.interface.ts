import {
  GenerateEmbeddingRequest,
  GenerateEmbeddingResult,
} from '@common/ai/interfaces/generate-embedding.interface';
import { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';

export interface TranscriptionOptions {
  initialPrompt?: string;
}

export interface IAiService {
  generateEmbedding(
    input: GenerateEmbeddingRequest,
  ): Promise<GenerateEmbeddingResult>;

  transcribeAudio(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
}
