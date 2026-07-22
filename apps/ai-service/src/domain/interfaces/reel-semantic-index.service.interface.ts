import type {
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
  getReelDocument(reelId: string): Promise<SemanticReelDocument | null>;
}
