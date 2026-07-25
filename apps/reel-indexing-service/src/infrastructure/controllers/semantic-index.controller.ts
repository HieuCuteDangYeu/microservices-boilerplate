import {
  LEGACY_SEMANTIC_BACKFILL_PATTERNS,
  type LegacySemanticReel,
} from '@common/processing/interfaces/legacy-semantic-backfill.interface';
import {
  SEMANTIC_INDEX_PATTERNS,
  type AdjacentChunkRequest,
  type SemanticIndexDeleteResult,
  type SemanticIndexReindexResult,
  type SemanticIndexSearchRequest,
  type SemanticIndexSearchResult,
  type SemanticReelDocument,
} from '@common/processing/interfaces/semantic-index.interface';
import type { IIndexingContentService } from '@indexing/domain/interfaces/content-service.interface';
import type { ISemanticIndexRepository } from '@indexing/domain/interfaces/semantic-index.repository.interface';
import { ImportLegacySemanticReelsUseCase } from '@indexing/application/use-cases/import-legacy-semantic-reels.use-case';
import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class SemanticIndexController {
  constructor(
    @Inject('ISemanticIndexRepository')
    private readonly semanticIndex: ISemanticIndexRepository,
    @Inject('IIndexingContentService')
    private readonly content: IIndexingContentService,
    private readonly importLegacy: ImportLegacySemanticReelsUseCase,
  ) {}

  @MessagePattern(SEMANTIC_INDEX_PATTERNS.SEARCH_REELS)
  async searchReels(
    @Payload() input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return await this.semanticIndex.searchReels(input ?? {});
  }

  @MessagePattern(SEMANTIC_INDEX_PATTERNS.SEARCH_SECTIONS)
  async searchSections(
    @Payload() input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return await this.semanticIndex.searchSections(input ?? {});
  }

  @MessagePattern(SEMANTIC_INDEX_PATTERNS.SEARCH_CHUNKS)
  async searchChunks(
    @Payload() input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return await this.semanticIndex.searchChunks(input ?? {});
  }

  @MessagePattern(SEMANTIC_INDEX_PATTERNS.GET_ADJACENT_CHUNKS)
  async getAdjacentChunks(
    @Payload() input: AdjacentChunkRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return await this.semanticIndex.getAdjacentChunks(input);
  }

  @MessagePattern(LEGACY_SEMANTIC_BACKFILL_PATTERNS.IMPORT_INDEX_PAGE)
  async importLegacySemanticReels(
    @Payload() input: { items?: LegacySemanticReel[] },
  ) {
    return await this.importLegacy.execute(input ?? {});
  }

  @MessagePattern(LEGACY_SEMANTIC_BACKFILL_PATTERNS.GET_INDEX_STATUS)
  async getLegacySemanticImportStatus() {
    return await this.semanticIndex.getLegacySemanticImportStatus();
  }

  @MessagePattern(SEMANTIC_INDEX_PATTERNS.GET_REEL_DOCUMENT)
  async getReelDocument(
    @Payload() input: { reelId?: string },
  ): Promise<SemanticReelDocument | null> {
    return await this.semanticIndex.getReelDocument(
      this.requiredReelId(input?.reelId),
    );
  }

  @MessagePattern(SEMANTIC_INDEX_PATTERNS.DELETE_REEL)
  async deleteReel(
    @Payload() input: { reelId?: string },
  ): Promise<SemanticIndexDeleteResult> {
    return {
      deleted: await this.semanticIndex.deleteReel(
        this.requiredReelId(input?.reelId),
      ),
    };
  }

  @MessagePattern(SEMANTIC_INDEX_PATTERNS.REINDEX_REEL)
  async reindexReel(
    @Payload() input: { reelId?: string },
  ): Promise<SemanticIndexReindexResult> {
    return await this.content.reindexReel(this.requiredReelId(input?.reelId));
  }

  private requiredReelId(reelId: string | undefined): string {
    if (!reelId?.trim()) throw new Error('reelId is required');
    return reelId.trim();
  }
}
