import {
  SEMANTIC_INDEX_PATTERNS,
  type SemanticIndexDeleteResult,
  type SemanticIndexReindexResult,
  type SemanticIndexSearchRequest,
  type SemanticIndexSearchResult,
  type SemanticReelDocument,
} from '@common/processing/interfaces/semantic-index.interface';
import type { IIndexingContentService } from '@indexing/domain/interfaces/content-service.interface';
import type { ISemanticIndexRepository } from '@indexing/domain/interfaces/semantic-index.repository.interface';
import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

@Controller()
export class SemanticIndexController {
  constructor(
    @Inject('ISemanticIndexRepository')
    private readonly semanticIndex: ISemanticIndexRepository,
    @Inject('IIndexingContentService')
    private readonly content: IIndexingContentService,
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
