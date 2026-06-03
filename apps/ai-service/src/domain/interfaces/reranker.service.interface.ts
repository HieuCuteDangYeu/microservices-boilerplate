import { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';

export interface IRerankerService {
  rerank(input: {
    queryText: string;
    candidates: ReelContextSearchResult[];
    limit: number;
  }): Promise<ReelContextSearchResult[]>;
}
