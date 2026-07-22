export interface ReelContextSearchRequest {
  queryVector: number[];
  queryText: string;
  userId: string;
  conversationId?: string;
  sharedOnly?: boolean;
  limit?: number;
}

export interface ReelContextAccessRequest {
  userId: string;
  conversationId: string;
}

export interface ReelContextAccessResult {
  reelIds: string[];
}
