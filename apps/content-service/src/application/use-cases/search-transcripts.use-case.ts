import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class SearchTranscriptsUseCase {
  private readonly logger = new Logger(SearchTranscriptsUseCase.name);

  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(
    queryVector: number[],
    userId: string,
  ): Promise<ReelContextSearchResult[]> {
    try {
      return await this.contentRepository.searchReelContext(
        queryVector,
        userId,
      );
    } catch (error) {
      this.logger.error(error);
      return [];
    }
  }
}
