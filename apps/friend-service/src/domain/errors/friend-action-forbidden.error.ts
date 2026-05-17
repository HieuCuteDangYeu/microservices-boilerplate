export class FriendActionForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendActionForbiddenError';
  }
}
