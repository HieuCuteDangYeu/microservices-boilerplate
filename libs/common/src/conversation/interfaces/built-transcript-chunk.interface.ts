export type BuiltTranscriptChunkType = 'metadata' | 'transcript';

export interface BuiltTranscriptChunk {
  type: BuiltTranscriptChunkType;
  text: string;
  startTime?: number;
  endTime?: number;
}
