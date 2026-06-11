export interface ReelContextSearchRequest {
  queryVector: number[];
  queryText: string;
  userId: string;
  conversationId?: string;
  sharedOnly?: boolean;
  limit?: number;
}
