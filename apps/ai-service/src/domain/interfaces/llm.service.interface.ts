export interface ILlmService {
  generateResponse(
    userMessage: string,
    context: string,
    userId: string,
  ): Promise<string>;
}
