export class InvalidMediaFileError extends Error {
  constructor() {
    super('The uploaded reel video file does not exist in storage.');
    this.name = 'InvalidMediaFileError';
  }
}

export class ReelNotFoundError extends Error {
  constructor() {
    super('Reel not found.');
    this.name = 'ReelNotFoundError';
  }
}

export class ReelNotReadyError extends Error {
  constructor() {
    super('Reel is not ready to be shared.');
    this.name = 'ReelNotReadyError';
  }
}

export class ReelShareForbiddenError extends Error {
  constructor(message = 'You are not allowed to share this reel.') {
    super(message);
    this.name = 'ReelShareForbiddenError';
  }
}
