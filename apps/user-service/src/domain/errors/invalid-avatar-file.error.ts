export class InvalidAvatarFileError extends Error {
  constructor() {
    super('The uploaded avatar file does not exist in storage.');
    this.name = 'InvalidAvatarFileError';
  }
}
