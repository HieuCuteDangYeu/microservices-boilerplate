import { ReelContextSearchRequest } from '@common/content/interfaces/reel-context-search-request.interface';
import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';

export type TranscriptMatch = ReelContextSearchResult;

export interface IContentService {
  searchReelContext(
    input: ReelContextSearchRequest,
  ): Promise<TranscriptMatch[]>;
}
