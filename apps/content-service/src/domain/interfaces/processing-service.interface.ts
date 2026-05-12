export interface IProcessingService {
  emitReelCreated(data: {
    reelId: string;
    mediaKey: string;
    userId: string;
  }): void;
}
