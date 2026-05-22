import {
  Friendship,
  FriendshipRecordStatus,
} from '../entities/friendship.entity';

export interface IFriendRepository {
  create(friendship: Friendship): Promise<Friendship>;
  findById(id: string): Promise<Friendship | null>;
  findByUsers(userId: string, otherUserId: string): Promise<Friendship | null>;
  listIncomingPending(userId: string): Promise<Friendship[]>;
  listOutgoingPending(userId: string): Promise<Friendship[]>;
  listAccepted(userId: string): Promise<Friendship[]>;
  updateStatus(
    id: string,
    status: FriendshipRecordStatus,
    respondedAt: Date | null,
  ): Promise<Friendship>;
  delete(id: string): Promise<void>;
}
