import type {
  ExtractedReelMetadata,
  ReelMetadataExtractionInput,
} from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type {
  GenerateEmbeddingBatchRequest,
  GenerateEmbeddingBatchResult,
} from '@common/ai/interfaces/generate-embedding.interface';
import type {
  CountDocumentTokensRequest,
  CountDocumentTokensResult,
} from '@common/ai/interfaces/count-document-tokens.interface';
import type { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';

export interface IIndexingAiService {
  transcribeAudioKey(input: {
    audioKey: string;
    initialPrompt?: string;
  }): Promise<TranscriptionResult>;

  extractReelMetadata(
    input: ReelMetadataExtractionInput,
  ): Promise<ExtractedReelMetadata>;

  generateEmbeddingBatch(
    input: GenerateEmbeddingBatchRequest,
  ): Promise<GenerateEmbeddingBatchResult>;

  countDocumentTokens(
    input: CountDocumentTokensRequest,
  ): Promise<CountDocumentTokensResult>;
}
