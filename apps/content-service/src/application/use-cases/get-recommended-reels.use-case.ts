import { Inject, Injectable } from '@nestjs/common';
import { Reel } from '../../domain/entities/reel.entity';
import type {
  IContentRepository,
  RecommendedReelsQuery,
  ReelCursor,
} from '../../domain/interfaces/content.repository.interface';

@Injectable()
export class GetRecommendedReelsUseCase {
  constructor(
    @Inject('IContentRepository')
    private readonly contentRepository: IContentRepository,
  ) {}

  async execute(query: RecommendedReelsQuery): Promise<{
    items: Reel[];
    nextCursor: ReelCursor | null;
  }> {
    return await this.contentRepository.listRecommendedReels({
      viewerId: query.viewerId,
      limit: query.limit,
      cursor: query.cursor,
      excludeRecentlySeen: query.excludeRecentlySeen,
    });
  }
}
