import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';

export type TranscriptMatch = ReelContextSearchResult;

export interface IContentService {
  searchReelContext(
    queryVector: number[],
    userId: string,
  ): Promise<TranscriptMatch[]>;
}
