import {
  Friendship,
  FriendshipRecordStatus,
} from '../entities/friendship.entity';

export interface FriendshipPaginationCursor {
  timestamp: Date;
  id: string;
}

export interface PaginatedFriendCollection<T> {
  items: T[];
  nextCursor: FriendshipPaginationCursor | null;
}

export type PaginatedFriendships = PaginatedFriendCollection<Friendship>;

export interface IFriendRepository {
  create(friendship: Friendship): Promise<Friendship>;
  findById(id: string): Promise<Friendship | null>;
  findByUsers(userId: string, otherUserId: string): Promise<Friendship | null>;
  listIncomingPending(
    userId: string,
    limit: number,
    cursor?: FriendshipPaginationCursor,
  ): Promise<PaginatedFriendships>;
  listOutgoingPending(
    userId: string,
    limit: number,
    cursor?: FriendshipPaginationCursor,
  ): Promise<PaginatedFriendships>;
  listAccepted(
    userId: string,
    limit: number,
    cursor?: FriendshipPaginationCursor,
  ): Promise<PaginatedFriendships>;
  updateStatus(
    id: string,
    status: FriendshipRecordStatus,
    respondedAt: Date | null,
  ): Promise<Friendship>;
  delete(id: string): Promise<void>;
}
