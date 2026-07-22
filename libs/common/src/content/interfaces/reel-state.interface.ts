export type ReelMediaStatus =
  | 'PENDING'
  | 'PROBING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type ReelIndexStatus =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'DEGRADED'
  | 'FAILED';

export type ReelSourceOrientation = 'PORTRAIT' | 'LANDSCAPE' | 'SQUARE';
export type ReelSourceLengthClass = 'SHORT' | 'LONG';
export type LegacyReelStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';
