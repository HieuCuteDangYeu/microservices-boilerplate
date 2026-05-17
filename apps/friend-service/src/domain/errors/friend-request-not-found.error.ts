export class FriendRequestNotFoundError extends Error {
  constructor(requestId: string) {
    super(`Friend request ${requestId} was not found`);
    this.name = 'FriendRequestNotFoundError';
  }
}
