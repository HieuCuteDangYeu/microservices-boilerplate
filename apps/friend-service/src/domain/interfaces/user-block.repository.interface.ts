export interface UserBlockPaginationCursor {
  timestamp: Date;
  id: string;
}

export interface UserBlockRecord {
  blockedUserId: string;
  createdAt: Date;
}

export interface PaginatedUserBlockRecords {
  items: UserBlockRecord[];
  nextCursor: UserBlockPaginationCursor | null;
}

export interface IUserBlockRepository {
  blockAndRemoveRelationship(
    blockerId: string,
    blockedUserId: string,
  ): Promise<void>;

  unblock(blockerId: string, blockedUserId: string): Promise<boolean>;

  isBlockedBetween(firstUserId: string, secondUserId: string): Promise<boolean>;

  listExcludedUserIds(userId: string): Promise<string[]>;

  listBlocked(
    blockerId: string,
    limit: number,
    cursor?: UserBlockPaginationCursor,
  ): Promise<PaginatedUserBlockRecords>;
}
