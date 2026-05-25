import { ReelFeedListItem } from '@common/content/interfaces/reel-response.interface';

export interface ReelContextScope {
  userId: string;
  visibility: 'public' | 'private';
}

export interface ReelProfileContextResponse {
  source: 'profile';
  scope: ReelContextScope;
  selectedId: string;
  selectedIndex: number;
  items: ReelFeedListItem[];
  previousCursor: string | null;
  nextCursor: string | null;
}
