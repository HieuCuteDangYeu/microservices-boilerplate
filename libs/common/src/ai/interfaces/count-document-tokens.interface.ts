export interface CountDocumentTokensRequest {
  model: string;
  items: Array<{
    id: string;
    text: string;
  }>;
}

export interface CountDocumentTokensResult {
  items: Array<{
    id: string;
    tokenCount: number;
  }>;
}
