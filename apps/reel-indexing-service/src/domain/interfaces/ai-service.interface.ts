import type {
  ExtractedReelMetadata,
  ReelMetadataExtractionInput,
} from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { GenerateEmbeddingResult } from '@common/ai/interfaces/generate-embedding.interface';
import type { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';

export interface IIndexingAiService {
  transcribeAudioKey(input: {
    audioKey: string;
    initialPrompt?: string;
  }): Promise<TranscriptionResult>;

  extractReelMetadata(
    input: ReelMetadataExtractionInput,
  ): Promise<ExtractedReelMetadata>;

  generateEmbedding(text: string): Promise<GenerateEmbeddingResult>;
}
