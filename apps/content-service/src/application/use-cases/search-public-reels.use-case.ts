import { Inject, Injectable } from '@nestjs/common';
import type {
  IContentRepository,
  ReelSearchResult,
} from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class SearchPublicReelsUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(data: {
    query: string;
    viewerId?: string;
    limit?: number;
  }): Promise<ReelSearchResult[]> {
    const query = data.query.trim();

    if (query.length === 0) {
      return [];
    }

    return await this.contentRepository.searchPublicReels({
      query,
      viewerId: data.viewerId,
      limit: data.limit,
    });
  }
}
