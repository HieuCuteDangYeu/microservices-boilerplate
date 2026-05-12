export interface IContentService {
  emitProcessingStarted(data: { reelId: string; status: 'PROCESSING' }): void;
  emitProcessingCompleted(data: {
    reelId: string;
    status: 'COMPLETED';
    transcript?: string;
    embedding?: number[];
    thumbnailKey?: string;
  }): void;

  emitProcessingFailed(data: { reelId: string; status: 'FAILED' }): void;
}
