import type { ExtractedReelMetadata } from '@common/ai/interfaces/reel-metadata-extraction.interface';
import type { TranscriptSegment } from '@common/ai/interfaces/transcription-result.interface';
import type { ReelIndexDocument } from '@common/processing/interfaces/reel-index-document.interface';
import type { ReelIndexJob } from '@common/processing/interfaces/reel-index-job.interface';
import type {
  AdjacentChunkRequest,
  SemanticIndexSearchRequest,
  SemanticIndexSearchResult,
  SemanticReelDocument,
} from '@common/processing/interfaces/semantic-index.interface';
import type { LegacySemanticReel } from '@common/processing/interfaces/legacy-semantic-backfill.interface';

export interface SemanticIndexCandidate {
  job: ReelIndexJob;
  metadata: ExtractedReelMetadata;
  transcriptSegments?: TranscriptSegment[];
  documents: ReelIndexDocument[];
  legacyImport?: boolean;
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
  getAdjacentChunks(
    input: AdjacentChunkRequest,
  ): Promise<SemanticIndexSearchResult[]>;
  getReelDocument(reelId: string): Promise<SemanticReelDocument | null>;
  deleteReel(reelId: string): Promise<boolean>;
  importLegacySemanticReels(input: LegacySemanticReel[]): Promise<{
    importedReels: number;
    skippedReels: number;
  }>;
  getLegacySemanticImportStatus(): Promise<{
    activeLegacyReels: number;
    activeLegacySections: number;
    activeLegacyChunks: number;
  }>;
}
