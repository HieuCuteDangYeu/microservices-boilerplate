export type AiChatMemoryRole = 'user' | 'assistant';

export interface AiChatMessageContext {
  role: AiChatMemoryRole;
  content: string;
  createdAt: string;
}

export interface AiChatMemoryContext {
  recentMessages: AiChatMessageContext[];
}
