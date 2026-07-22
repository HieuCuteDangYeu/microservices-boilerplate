import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ReelIndexDocument } from '@common/processing/interfaces/reel-index-document.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type {
  SemanticIndexSearchRequest,
  SemanticIndexSearchResult,
  SemanticReelDocument,
} from '@common/processing/interfaces/semantic-index.interface';

export interface SemanticIndexCandidate {
  job: ReelIndexJob;
  metadata: ExtractedReelMetadata;
  transcriptSegments?: TranscriptSegment[];
  documents: ReelIndexDocument[];
}

export interface ISemanticIndexRepository {
  persistCandidate(input: SemanticIndexCandidate): Promise<void>;
  activateCandidate(reelId: string, indexAttemptId: string): Promise<void>;
  discardCandidate(reelId: string, indexAttemptId: string): Promise<void>;
  searchReels(
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]>;
  searchSections(
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]>;
  searchChunks(
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]>;
  getReelDocument(reelId: string): Promise<SemanticReelDocument | null>;
  deleteReel(reelId: string): Promise<boolean>;
}
