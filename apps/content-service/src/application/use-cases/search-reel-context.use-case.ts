import { ReelContextSearchRequest } from '@common/content/interfaces/reel-context-search-request.interface';
import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class SearchReelContextUseCase {
  private readonly logger = new Logger(SearchReelContextUseCase.name);

  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(
    input: ReelContextSearchRequest,
  ): Promise<ReelContextSearchResult[]> {
    try {
      const results = await this.contentRepository.searchReelContext(input);

      const matchedByCounts = results.reduce<Record<string, number>>(
        (acc, item) => {
          const key = item.matchedBy ?? 'UNKNOWN';
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {},
      );

      this.logger.log(
        `[RAG] reel context search queryLength=${input.queryText.length} results=${results.length} matchedBy=${JSON.stringify(
          matchedByCounts,
        )} topScore=${results[0]?.score ?? 'n/a'} topChunks=${results
          .slice(0, 5)
          .map((item) => item.chunkId)
          .join(',')}`,
      );

      return results;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Reel context search failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      return [];
    }
  }
}
