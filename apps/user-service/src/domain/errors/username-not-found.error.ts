export class UsernameNotFoundError extends Error {
  constructor(username: string) {
    super(`User with username '${username}' not found.`);
    this.name = UsernameNotFoundError.name;
  }
}
