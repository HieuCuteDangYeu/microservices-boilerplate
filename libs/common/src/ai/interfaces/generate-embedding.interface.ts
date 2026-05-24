export type EmbeddingTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';

export interface GenerateEmbeddingRequest {
  text: string;
  taskType?: EmbeddingTaskType;
  title?: string;
}
