export class InvalidTokenError extends Error {
  constructor() {
    super('Invalid or expired confirmation token');
    this.name = 'InvalidTokenError';
  }
}
