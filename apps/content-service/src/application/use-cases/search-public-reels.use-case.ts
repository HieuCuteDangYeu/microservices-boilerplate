import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly config: ConfigService,
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

    if (!this.indexingSearchEnabled()) {
      return await this.contentRepository.searchPublicReels({
        query,
        viewerId: data.viewerId,
        limit: data.limit,
      });
    }

    try {
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
    } catch (error) {
      if (!this.legacyContentSemanticReadFallbackEnabled()) {
        throw error;
      }
      return await this.contentRepository.searchPublicReels({
        query,
        viewerId: data.viewerId,
        limit: data.limit,
      });
    }
  }

  private indexingSearchEnabled(): boolean {
    return (
      this.config
        .get<string>('PUBLIC_SEARCH_INDEXING_SERVICE_ENABLED')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }

  private legacyContentSemanticReadFallbackEnabled(): boolean {
    return (
      this.config
        .get<string>('LEGACY_CONTENT_SEMANTIC_READ_FALLBACK_ENABLED')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }
}
