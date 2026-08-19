import type {
  CountDocumentTokensRequest,
  CountDocumentTokensResult,
} from '@common/ai/interfaces/count-document-tokens.interface';
import type {
  GenerateEmbeddingBatchRequest,
  GenerateEmbeddingBatchResult,
} from '@common/ai/interfaces/generate-embedding.interface';
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

export interface IndexQualityReviewInput {
  reelId: string;
  sourceLengthClass: 'SHORT' | 'LONG';
  durationMs: number;
  title?: string;
  description?: string;
  tags: string[];
  documents: Array<{
    id: string;
    kind: 'REEL' | 'SECTION' | 'CHUNK' | 'VISUAL_SCENE';
    ordinal: number;
    parentId?: string;
    startTime?: number;
    endTime?: number;
    evidenceQuality: 'VERIFIED' | 'LOW_CONFIDENCE' | 'METADATA_ONLY';
    text: string;
  }>;
}

export interface IndexQualityReviewResult {
  acceptable: boolean;
  confidence: number;
  summary: string;
  issues: Array<{
    category:
      | 'METADATA'
      | 'SECTIONING'
      | 'GROUNDING'
      | 'VISUAL_CONTEXT'
      | 'RETRIEVAL_QUALITY';
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    message: string;
    documentId?: string;
  }>;
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
    input: IndexQualityReviewInput,
  ): Promise<IndexQualityReviewResult>;

  generateEmbeddingBatch(
    input: GenerateEmbeddingBatchRequest,
  ): Promise<GenerateEmbeddingBatchResult>;

  countDocumentTokens(
    input: CountDocumentTokensRequest,
  ): Promise<CountDocumentTokensResult>;
}
