import { PublicUserProfile } from '@common/user/interfaces/public-user-profile.types';

export type FriendshipState =
  | 'none'
  | 'request_sent'
  | 'request_received'
  | 'friends';

export interface FriendshipActionResponse {
  message: string;
  status: FriendshipState;
  id?: string;
  conversationId?: string;
}

export interface PaginatedFriendResults<T> {
  items: T[];
  nextCursor: string | null;
}

export interface FriendshipStatusResponse {
  status: FriendshipState;
  id?: string;
}

export interface FriendRequestSummary {
  id: string;
  status: 'request_sent' | 'request_received';
  requestedAt: Date;
  user: PublicUserProfile;
}

export interface FriendSummary {
  id: string;
  status: 'friends';
  friendsSince: Date;
  user: PublicUserProfile;
}
