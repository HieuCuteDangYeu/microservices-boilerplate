export class FriendshipAlreadyExistsError extends Error {
  constructor() {
    super('You are already friends with this user');
    this.name = 'FriendshipAlreadyExistsError';
  }
}
