import type {
  SearchSuggestion,
  SearchSuggestionsQuery,
} from '@content/domain/interfaces/content.repository.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IContentRepository } from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class GetSearchSuggestionsUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(query: SearchSuggestionsQuery): Promise<SearchSuggestion[]> {
    return this.contentRepository.getSearchSuggestions(query);
  }
}
