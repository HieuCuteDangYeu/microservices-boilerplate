export interface ILlmService {
  generateResponseStream(
    userMessage: string,
    context: string,
    userId: string,
    onToken: (token: string) => void,
    sessionAffinityKey?: string,
  ): Promise<string>;
}
