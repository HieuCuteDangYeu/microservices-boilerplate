import { TranscriptSearchResult } from '@common/content/interfaces/transcript-search-result.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class SearchTranscriptsUseCase {
  private readonly logger = new Logger(SearchTranscriptsUseCase.name);

  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(queryVector: number[]): Promise<TranscriptSearchResult[]> {
    try {
      return await this.contentRepository.searchTranscripts(queryVector);
    } catch (error) {
      this.logger.error(error);
      return [];
    }
  }
}
