export type AiChatMemoryRole = 'user' | 'assistant';
export type AiChatMessageEventType = 'TEXT' | 'REEL_SHARE';

export interface AiChatMessageContext {
  role: AiChatMemoryRole;
  content: string;
  createdAt: string;
  eventType?: AiChatMessageEventType;
}

export interface AiChatMemoryContext {
  recentMessages: AiChatMessageContext[];
}
