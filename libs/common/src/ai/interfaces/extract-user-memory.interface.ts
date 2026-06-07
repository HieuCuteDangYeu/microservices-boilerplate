import type { UserMemoryType } from './user-memory.interface';

export type ExtractedUserMemoryScope = 'LONG_TERM' | 'TEMPORARY';

export interface ExtractedUserMemoryCandidate {
  type: UserMemoryType;
  content: string;
  confidence: number;
  scope: ExtractedUserMemoryScope;
  evidence: string;
}

export interface ExtractUserMemoriesRequest {
  userId: string;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
}

export interface ExtractUserMemoriesResult {
  memories: ExtractedUserMemoryCandidate[];
}
