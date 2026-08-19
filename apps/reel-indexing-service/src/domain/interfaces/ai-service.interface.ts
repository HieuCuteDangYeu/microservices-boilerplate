import type {
  CountDocumentTokensRequest,
  CountDocumentTokensResult,
} from '@common/ai/interfaces/count-document-tokens.interface';
import type {
  GenerateEmbeddingBatchRequest,
  GenerateEmbeddingBatchResult,
} from '@common/ai/interfaces/generate-embedding.interface';
import type {
  IndexQualityReviewRequest,
  IndexQualityReviewResult,
} from '@common/ai/interfaces/index-quality-review.interface';
import type {
  ExtractedReelMetadata,
  ReelMetadataExtractionInput,
} from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { TranscriptionResult } from '@common/ai/interfaces/transcription-result.interface';
import type { VisualFrameAnalysis } from '@common/ai/interfaces/visual-analysis.interface';

export interface IndexingVisualFrameInput {
  imageBytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  timestampMs: number;
}

export interface IIndexingAiService {
  transcribeAudioKey(input: {
    audioKey: string;
    initialPrompt?: string;
  }): Promise<TranscriptionResult>;

  analyzeVisualFrame(
    input: IndexingVisualFrameInput,
  ): Promise<VisualFrameAnalysis>;

  extractReelMetadata(
    input: ReelMetadataExtractionInput,
  ): Promise<ExtractedReelMetadata>;

  reviewIndexQuality(
    input: IndexQualityReviewRequest,
  ): Promise<IndexQualityReviewResult>;

  generateEmbeddingBatch(
    input: GenerateEmbeddingBatchRequest,
  ): Promise<GenerateEmbeddingBatchResult>;

  countDocumentTokens(
    input: CountDocumentTokensRequest,
  ): Promise<CountDocumentTokensResult>;
}
