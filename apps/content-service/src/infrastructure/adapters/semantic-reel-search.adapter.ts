import type {
  ISemanticReelSearchService,
  SemanticReelSearchCandidate,
} from '@content/domain/interfaces/semantic-reel-search.service.interface';
import {
  SEMANTIC_INDEX_PATTERNS,
  type SemanticIndexSearchResult,
} from '@common/processing/interfaces/semantic-index.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';

@Injectable()
export class SemanticReelSearchAdapter implements ISemanticReelSearchService {
  private readonly logger = new Logger(SemanticReelSearchAdapter.name);

  constructor(
    @Inject('INDEX_SERVICE_RMQ') private readonly indexClient: ClientProxy,
  ) {}

  async searchPublicReels(input: {
    query: string;
    limit: number;
  }): Promise<SemanticReelSearchCandidate[]> {
    try {
      const results = await firstValueFrom(
        this.indexClient
          .send<SemanticIndexSearchResult[]>(
            SEMANTIC_INDEX_PATTERNS.SEARCH_REELS,
            {
              queryText: input.query,
              limit: input.limit,
              candidateLimit: Math.min(Math.max(input.limit * 4, 24), 120),
            },
          )
          .pipe(timeout(4_000)),
      );
      return (Array.isArray(results) ? results : []).map((result) => ({
        reelId: result.reelId,
        score: result.rrfScore,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Indexing public search unavailable: ${message}`);
      return [];
    }
  }
}
