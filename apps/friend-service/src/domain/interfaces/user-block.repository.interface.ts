export interface IUserBlockRepository {
  blockAndRemoveRelationship(
    blockerId: string,
    blockedUserId: string,
  ): Promise<void>;

  unblock(blockerId: string, blockedUserId: string): Promise<boolean>;

  isBlockedBetween(firstUserId: string, secondUserId: string): Promise<boolean>;

  listExcludedUserIds(userId: string): Promise<string[]>;
}
