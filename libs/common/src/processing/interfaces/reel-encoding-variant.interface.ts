export type ReelEncodingQuality = '360p' | '540p' | '720p' | '1080p';

export interface ReelEncodingVariantOutput {
  name: ReelEncodingQuality;
  width: number;
  height: number;
}
