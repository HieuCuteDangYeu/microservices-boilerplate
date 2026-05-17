export class UsernameAlreadyTakenError extends Error {
  constructor(username: string) {
    super(`Username '${username}' is already taken.`);
    this.name = UsernameAlreadyTakenError.name;
  }
}
