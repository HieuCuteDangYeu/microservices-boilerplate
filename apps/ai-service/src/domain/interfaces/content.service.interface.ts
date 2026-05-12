export interface TranscriptMatch {
  transcript: string;
  distance: number;
}

export interface IContentService {
  searchTranscripts(queryVector: number[]): Promise<TranscriptMatch[]>;
}
