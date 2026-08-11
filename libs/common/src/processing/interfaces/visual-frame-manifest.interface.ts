export type VisualFrameSampleReason =
  | 'PERIODIC'
  | 'SCENE_CHANGE'
  | 'PERIODIC_AND_SCENE_CHANGE';

export interface VisualFrameArtifact {
  key: string;
  timestampMs: number;
  checksum: string;
  byteLength: number;
  reason: VisualFrameSampleReason;
}

export interface VisualFrameManifest {
  reelId: string;
  mediaAttemptId: string;
  totalDurationMs: number;
  sampling: {
    periodicIntervalMs: number;
    sceneThreshold: number;
    dedupeWindowMs: number;
    maxFrames: number;
  };
  artifacts: VisualFrameArtifact[];
  version: 1;
}
