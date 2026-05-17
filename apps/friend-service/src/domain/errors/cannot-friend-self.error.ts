export class CannotFriendSelfError extends Error {
  constructor() {
    super('You cannot add yourself as a friend');
    this.name = 'CannotFriendSelfError';
  }
}
