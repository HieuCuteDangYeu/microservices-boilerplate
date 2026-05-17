export class InvalidFullNameError extends Error {
  constructor() {
    super('Full name must be between 1 and 80 characters.');
    this.name = InvalidFullNameError.name;
  }
}
