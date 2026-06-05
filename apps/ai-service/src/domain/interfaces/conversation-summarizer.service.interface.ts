export interface SummarizeConversationTurnInput {
  existingSummary?: string;
  userMessage: string;
  assistantMessage: string;
}

export interface SummarizeConversationTurnResult {
  summary: string;
}

export interface IConversationSummarizerService {
  summarizeTurn(
    input: SummarizeConversationTurnInput,
  ): Promise<SummarizeConversationTurnResult>;
}
