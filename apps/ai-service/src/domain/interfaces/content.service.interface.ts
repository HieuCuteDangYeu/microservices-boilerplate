export interface TranscriptMatch {
  reelId: string;
  title?: string;
  description?: string;
  tags: string[];
  transcript?: string;
  distance: number;
}

export interface IContentService {
  searchReelContext(
    queryVector: number[],
    userId: string,
  ): Promise<TranscriptMatch[]>;
}
