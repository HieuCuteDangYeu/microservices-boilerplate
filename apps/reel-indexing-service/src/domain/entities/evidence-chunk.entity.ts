export interface EvidenceChunk {
  evidenceText: string;
  startTime: number;
  endTime: number;
  sourceSegmentIds: string[];
  sourceAudioArtifactIds: string[];
}
