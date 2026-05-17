export type FriendshipRecordStatus = 'PENDING' | 'ACCEPTED';

export class Friendship {
  constructor(
    public readonly id: string | null,
    public readonly requesterId: string,
    public readonly recipientId: string,
    public readonly userOneId: string,
    public readonly userTwoId: string,
    public readonly status: FriendshipRecordStatus,
    public readonly createdAt: Date | null,
    public readonly updatedAt: Date | null,
    public readonly respondedAt: Date | null,
  ) {}

  static createPair(userId: string, otherUserId: string) {
    return userId < otherUserId
      ? { userOneId: userId, userTwoId: otherUserId }
      : { userOneId: otherUserId, userTwoId: userId };
  }

  getOtherUserId(userId: string): string {
    return this.requesterId === userId ? this.recipientId : this.requesterId;
  }
}
