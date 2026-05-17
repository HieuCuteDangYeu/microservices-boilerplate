export class GoogleAuthNotConfiguredError extends Error {
  constructor() {
    super('Google client IDs are not configured');
    this.name = 'GoogleAuthNotConfiguredError';
  }
}
