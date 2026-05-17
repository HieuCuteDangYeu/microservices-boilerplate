export class FriendRequestAlreadyReceivedError extends Error {
  constructor() {
    super('You already have a pending friend request from this user');
    this.name = 'FriendRequestAlreadyReceivedError';
  }
}
