import type {
  AdjacentChunkRequest,
  SemanticIndexSearchRequest,
  SemanticIndexSearchResult,
  SemanticReelDocument,
} from '@common/processing/interfaces/semantic-index.interface';

export interface IReelSemanticIndexService {
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
}
