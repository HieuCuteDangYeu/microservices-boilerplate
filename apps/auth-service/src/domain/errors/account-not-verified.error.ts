export class AccountNotVerifiedError extends Error {
  constructor() {
    super('Account is not verified. Please check your email.');
    this.name = 'AccountNotVerifiedError';
  }
}
