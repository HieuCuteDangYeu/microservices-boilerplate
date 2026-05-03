export interface BotError {
  code: 'AI_UNAVAILABLE' | 'NO_CONTENT' | 'UNKNOWN';
  message: string;
}

export interface AskQuestionResult {
  answer: string | null;
  error?: BotError;
}

export interface IAiService {
  askQuestionStream(
    message: string,
    userId: string,
    conversationId: string,
  ): Promise<AskQuestionResult>;
}
