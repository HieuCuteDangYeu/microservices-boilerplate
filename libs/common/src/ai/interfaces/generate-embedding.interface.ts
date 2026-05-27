export type EmbeddingTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';

export interface GenerateEmbeddingRequest {
  text: string;
  taskType?: EmbeddingTaskType;
  title?: string;
}

export interface GenerateEmbeddingResult {
  values: number[];
  model: string;
  dimensions: number;
}
