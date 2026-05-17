export class FriendUserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User ${userId} was not found`);
    this.name = 'FriendUserNotFoundError';
  }
}
