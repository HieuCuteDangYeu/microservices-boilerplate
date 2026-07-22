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
  provider?: string;
  version?: string;
}

export interface GenerateEmbeddingBatchItem {
  id: string;
  text: string;
  taskType?: EmbeddingTaskType;
  title?: string;
}

export interface GenerateEmbeddingBatchRequest {
  items: GenerateEmbeddingBatchItem[];
}

export interface GenerateEmbeddingBatchResultItem extends GenerateEmbeddingResult {
  id: string;
}

export interface GenerateEmbeddingBatchError {
  id: string;
  error: string;
}

export interface GenerateEmbeddingBatchResult {
  embeddings: GenerateEmbeddingBatchResultItem[];
  errors: GenerateEmbeddingBatchError[];
}
