export interface TranscriptSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
  [key: string]: unknown;
}

export interface TranscriptionResult {
  text: string;
  vtt?: string;
  segments?: TranscriptSegment[];
  wordCount?: number;
}
