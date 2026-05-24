export interface IProcessingService {
  emitReelCreated(data: {
    reelId: string;
    mediaKey: string;
    userId: string;
    title?: string;
    description?: string;
    tags: string[];
  }): Promise<void>;
}
