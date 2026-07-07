import { ReelFeedListItem } from '@common/content/interfaces/reel-response.interface';
import { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';

export type GlobalSearchType = 'all' | 'users' | 'reels';

export interface GlobalSearchResponse {
  query: string;
  type: GlobalSearchType;
  users: PublicUserProfile[];
  reels: ReelFeedListItem[];
  counts: {
    users: number;
    reels: number;
  };
}
