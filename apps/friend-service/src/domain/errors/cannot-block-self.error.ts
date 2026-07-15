export class CannotBlockSelfError extends Error {
  constructor() {
    super('You cannot block yourself');
    this.name = 'CannotBlockSelfError';
  }
}
