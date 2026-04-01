export interface IContentService {
  getReelStatus(reelId: string): Promise<{ status: string; mediaKey?: string }>;
}
