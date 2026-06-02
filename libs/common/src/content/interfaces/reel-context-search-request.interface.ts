export interface ReelContextSearchRequest {
  queryVector: number[];
  queryText: string;
  userId: string;
  limit?: number;
}
