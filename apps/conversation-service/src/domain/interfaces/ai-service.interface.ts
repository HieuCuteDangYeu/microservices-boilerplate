import type { AiChatMemoryContext } from '@common/ai/interfaces/chat-memory-context.interface';
import { ConversationTurnCompletedPayload } from '@common/ai/interfaces/user-memory.interface';

export interface BotError {
  code: 'AI_UNAVAILABLE' | 'NO_CONTENT' | 'UNKNOWN';
  message: string;
}

export interface AskQuestionResult {
  answer: string | null;
  error?: BotError;
}

export interface AskQuestionStreamInput {
  message: string;
  userId: string;
  conversationId: string;
  memory?: AiChatMemoryContext;
}

export interface IAiService {
  askQuestionStream(input: AskQuestionStreamInput): Promise<AskQuestionResult>;
  emitConversationTurnCompleted(input: ConversationTurnCompletedPayload): void;
}
