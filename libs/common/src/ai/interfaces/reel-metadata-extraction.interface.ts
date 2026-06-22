export interface ReelMetadataExtractionInput {
  title?: string;
  description?: string;
  tags?: string[];
  transcript?: string;
  maxTags?: number;
}

export interface ExtractedReelMetadata {
  title?: string;
  description?: string;
  tags: string[];
}
