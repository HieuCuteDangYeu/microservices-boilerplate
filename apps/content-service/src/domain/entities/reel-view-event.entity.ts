export type ReelViewEventType =
  | 'IMPRESSION'
  | 'WATCH_START'
  | 'WATCH_PROGRESS'
  | 'WATCH_END'
  | 'SKIP'
  | 'COMPLETE'
  | 'REPLAY'
  | 'PAUSE'
  | 'RESUME'
  | 'MUTE'
  | 'UNMUTE';

export type ReelEventSource =
  | 'RECOMMENDED'
  | 'FRIENDS'
  | 'PUBLIC_FEED'
  | 'PROFILE'
  | 'SEARCH'
  | 'SHARED'
  | 'DIRECT'
  | 'UNKNOWN';

export interface ReelEventRecommendation {
  recommendationId: string;
  feedSessionId: string;
  algorithmVersion: string;
  candidateSource: string;
  rank: number;
  generatedAt: Date;
}

export interface CreateReelViewEventInput {
  eventId: string;
  reelId: string;
  userId: string;
  playbackSessionId: string;
  sequence: number;
  eventType: ReelViewEventType;
  source: ReelEventSource;
  occurredAt: Date;
  watchMs?: number;
  durationMs?: number;
  percentageWatched?: number;
  muted?: boolean;
  completed?: boolean;
  replayed?: boolean;
  skipped?: boolean;
  recommendation?: ReelEventRecommendation;
}

export class ReelViewEvent {
  constructor(
    public readonly eventId: string,
    public readonly reelId: string,
    public readonly userId: string,
    public readonly playbackSessionId: string,
    public readonly sequence: number,
    public readonly eventType: ReelViewEventType,
    public readonly source: ReelEventSource,
    public readonly occurredAt: Date,
    public readonly watchMs: number,
    public readonly durationMs: number | null,
    public readonly percentageWatched: number | null,
    public readonly muted: boolean | null,
    public readonly completed: boolean,
    public readonly replayed: boolean,
    public readonly skipped: boolean,
    public readonly recommendation: ReelEventRecommendation | null,
  ) {}

  static create(input: CreateReelViewEventInput): ReelViewEvent {
    const watchMs = Math.max(0, Math.floor(input.watchMs ?? 0));

    const durationMs =
      input.durationMs === undefined
        ? null
        : Math.max(0, Math.floor(input.durationMs));

    const calculatedPercentage =
      durationMs !== null && durationMs > 0
        ? (watchMs / durationMs) * 100
        : null;

    const percentageWatched =
      input.percentageWatched !== undefined
        ? ReelViewEvent.clampPercentage(input.percentageWatched)
        : calculatedPercentage === null
          ? null
          : ReelViewEvent.clampPercentage(calculatedPercentage);

    return new ReelViewEvent(
      input.eventId,
      input.reelId,
      input.userId,
      input.playbackSessionId,
      input.sequence,
      input.eventType,
      input.source,
      input.occurredAt,
      watchMs,
      durationMs,
      percentageWatched,
      input.muted ?? null,
      input.completed ?? input.eventType === 'COMPLETE',
      input.replayed ?? input.eventType === 'REPLAY',
      input.skipped ?? input.eventType === 'SKIP',
      input.recommendation ?? null,
    );
  }

  private static clampPercentage(value: number): number {
    return Math.min(Math.max(value, 0), 100);
  }
}
