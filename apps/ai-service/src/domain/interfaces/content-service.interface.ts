import type { AiRecommendedReel } from '@common/ai/dtos/ask-question-response.dto';
import { ReelContextAccessRequest } from '@common/content/interfaces/reel-context-search-request.interface';
import type { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';

export type TranscriptMatch = ReelContextSearchResult;

export interface PublicReelSearchInput {
  query: string;
  viewerId?: string;
  limit?: number;
}

export interface RecommendedReelsInput {
  viewerId: string;
  limit?: number;
}

export interface IContentService {
  resolveReelContextAccess(input: ReelContextAccessRequest): Promise<string[]>;

  searchPublicReels(input: PublicReelSearchInput): Promise<AiRecommendedReel[]>;

  getRecommendedReels(
    input: RecommendedReelsInput,
  ): Promise<AiRecommendedReel[]>;
}
