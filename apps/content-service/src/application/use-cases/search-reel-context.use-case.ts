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
      return await this.contentRepository.searchReelContext(input);
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
