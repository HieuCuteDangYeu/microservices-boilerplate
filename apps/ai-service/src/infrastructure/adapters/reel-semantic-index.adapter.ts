import type { IReelSemanticIndexService } from '@ai/domain/interfaces/reel-semantic-index.service.interface';
import {
  SEMANTIC_INDEX_PATTERNS,
  type AdjacentChunkRequest,
  type SemanticIndexSearchRequest,
  type SemanticIndexSearchResult,
  type SemanticReelDocument,
} from '@common/processing/interfaces/semantic-index.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class ReelSemanticIndexAdapter implements IReelSemanticIndexService {
  private readonly logger = new Logger(ReelSemanticIndexAdapter.name);

  constructor(
    @Inject('INDEX_RMQ')
    private readonly indexClient: ClientProxy,
  ) {}

  searchReels(
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return this.search(SEMANTIC_INDEX_PATTERNS.SEARCH_REELS, input);
  }

  searchSections(
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return this.search(SEMANTIC_INDEX_PATTERNS.SEARCH_SECTIONS, input);
  }

  searchChunks(
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return this.search(SEMANTIC_INDEX_PATTERNS.SEARCH_CHUNKS, input);
  }

  getAdjacentChunks(
    input: AdjacentChunkRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    return this.search(SEMANTIC_INDEX_PATTERNS.GET_ADJACENT_CHUNKS, input);
  }

  async getReelDocument(reelId: string): Promise<SemanticReelDocument | null> {
    try {
      return await firstValueFrom(
        this.indexClient
          .send<SemanticReelDocument | null>(
            SEMANTIC_INDEX_PATTERNS.GET_REEL_DOCUMENT,
            { reelId },
          )
          .pipe(timeout(4_000)),
      );
    } catch (error: unknown) {
      this.logUnavailable('get reel document', error);
      return null;
    }
  }

  private async search(
    pattern: string,
    input: SemanticIndexSearchRequest,
  ): Promise<SemanticIndexSearchResult[]> {
    try {
      const results = await firstValueFrom(
        this.indexClient
          .send<SemanticIndexSearchResult[]>(pattern, input)
          .pipe(timeout(4_000)),
      );

      return Array.isArray(results) ? results : [];
    } catch (error: unknown) {
      this.logUnavailable(pattern, error);
      return [];
    }
  }

  private logUnavailable(operation: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Semantic index unavailable during ${operation}: ${message}. Returning no context.`,
    );
  }
}
