import type { ReelVisibility } from '@common/content/schemas/reel-visibility.schema';

export interface FriendFeedAudienceResponse {
  friendUserIds: string[];
  excludedUserIds: string[];
}

export interface CanViewReelContentRequest {
  viewerId: string;
  ownerId: string;
  visibility: ReelVisibility;
}

export interface CanViewReelContentResponse {
  allowed: boolean;
}
