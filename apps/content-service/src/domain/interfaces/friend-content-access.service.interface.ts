import type { ReelVisibility } from '@common/content/schemas/reel-visibility.schema';
import type { FriendFeedAudienceResponse } from '@common/friend/interfaces/friend-content-access.interface';

export interface IFriendContentAccessService {
  getFeedAudience(viewerId: string): Promise<FriendFeedAudienceResponse>;

  canView(input: {
    viewerId: string;
    ownerId: string;
    visibility: ReelVisibility;
  }): Promise<boolean>;
}
