import type { AiChatMessageContext } from '@common/ai/interfaces/chat-memory-context.interface';

export interface SummarizeConversationTurnInput {
  existingSummary?: string;
  recentMessages?: AiChatMessageContext[];
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
