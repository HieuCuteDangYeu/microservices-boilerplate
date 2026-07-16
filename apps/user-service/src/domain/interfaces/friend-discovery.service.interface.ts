import type { FriendFeedAudienceResponse } from '@common/friend/interfaces/friend-content-access.interface';

export interface IFriendDiscoveryService {
  getAudience(userId: string): Promise<FriendFeedAudienceResponse>;
}
