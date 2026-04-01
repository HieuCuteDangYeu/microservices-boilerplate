export class LlmUnavailableError extends Error {
  constructor() {
    super('The AI model is currently overloaded. Please try again later.');
    this.name = 'LlmUnavailableError';
  }
}
