import type { AiChatMemoryContext } from './chat-memory-context.interface';

export type UserMemoryType =
  | 'PREFERENCE'
  | 'PROFILE'
  | 'PROJECT'
  | 'TECHNICAL_CONTEXT'
  | 'COMMUNICATION_STYLE'
  | 'OTHER';

export interface UserMemoryItem {
  id?: string;
  userId: string;
  type: UserMemoryType;
  content: string;
  confidence: number;
  sourceConversationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RelevantUserMemoriesContext {
  memories: UserMemoryItem[];
}

export interface ConversationTurnCompletedPayload {
  conversationId: string;
  userId: string;
  userMessage: string;
  assistantMessage: string;
  memory?: AiChatMemoryContext;
}
