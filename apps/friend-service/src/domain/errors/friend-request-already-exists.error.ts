export class FriendRequestAlreadyExistsError extends Error {
  constructor() {
    super('A friend request has already been sent to this user');
    this.name = 'FriendRequestAlreadyExistsError';
  }
}
