import { Inject, Injectable } from '@nestjs/common';
import type {
  IContentRepository,
  ReelSearchResult,
} from '../../domain/interfaces/content.repository.interface';
import type { ISemanticReelSearchService } from '@content/domain/interfaces/semantic-reel-search.service.interface';

@Injectable()
export class SearchPublicReelsUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
    @Inject('ISemanticReelSearchService')
    private readonly semanticSearch: ISemanticReelSearchService,
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

    const limit = Math.min(Math.max(data.limit ?? 12, 1), 30);
    const candidates = await this.semanticSearch.searchPublicReels({
      query,
      limit,
    });
    const reels = await this.contentRepository.findSearchablePublicReels(
      candidates.map((candidate) => candidate.reelId),
    );
    const reelById = new Map(reels.map((reel) => [reel.id, reel]));
    return candidates.flatMap((candidate) => {
      const reel = reelById.get(candidate.reelId);
      return reel ? [{ reel, score: candidate.score }] : [];
    });
  }
}
