export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User with ID ${id} not found`);
    this.name = 'UserNotFoundError';
  }
}
