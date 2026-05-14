export interface IContentService {
  emitProcessingStarted(data: {
    reelId: string;
    status: 'PROCESSING';
  }): Promise<void>;
  emitProcessingCompleted(data: {
    reelId: string;
    status: 'COMPLETED';
    transcript?: string;
    embedding?: number[];
    thumbnailKey?: string;
  }): Promise<void>;

  emitProcessingFailed(data: {
    reelId: string;
    status: 'FAILED';
  }): Promise<void>;
}
