export class InvalidUsernameError extends Error {
  constructor() {
    super(
      'Username must be 3-30 characters and contain only lowercase letters, numbers, or underscores.',
    );
    this.name = InvalidUsernameError.name;
  }
}
