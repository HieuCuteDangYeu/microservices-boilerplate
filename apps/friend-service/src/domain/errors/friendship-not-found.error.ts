export class FriendshipNotFoundError extends Error {
  constructor(userId: string) {
    super(`No friendship with user ${userId} was found`);
    this.name = 'FriendshipNotFoundError';
  }
}
