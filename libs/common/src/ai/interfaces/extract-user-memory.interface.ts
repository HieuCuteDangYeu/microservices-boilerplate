import type { UserMemoryType } from './user-memory.interface';

export interface ExtractedUserMemoryCandidate {
  type: UserMemoryType;
  content: string;
  confidence: number;
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
