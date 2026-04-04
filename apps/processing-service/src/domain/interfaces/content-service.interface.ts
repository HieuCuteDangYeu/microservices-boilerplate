export interface IContentService {
  emitProcessingCompleted(data: {
    reelId: string;
    status: 'COMPLETED';
    transcript?: string;
    embedding?: number[];
  }): void;

  emitProcessingFailed(data: { reelId: string; status: 'FAILED' }): void;
}
