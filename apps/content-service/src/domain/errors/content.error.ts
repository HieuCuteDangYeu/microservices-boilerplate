export class InvalidMediaFileError extends Error {
  constructor() {
    super('The uploaded reel video file does not exist in storage.');
    this.name = 'InvalidMediaFileError';
  }
}
