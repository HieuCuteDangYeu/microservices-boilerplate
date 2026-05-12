export interface ILlmService {
  generateResponseStream(
    userMessage: string,
    context: string,
    userId: string,
    onToken: (token: string) => void,
  ): Promise<string>;
}
