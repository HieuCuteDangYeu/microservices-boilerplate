import {
  ReelEventRecommendation,
  ReelEventSource,
  ReelViewEvent,
  ReelViewEventType,
} from '@content/domain/entities/reel-view-event.entity';
import type { IReelViewEventRepository } from '@content/domain/interfaces/reel-view-event.repository.interface';
import { Inject, Injectable } from '@nestjs/common';

export interface TrackReelEventCommand {
  eventId: string;
  reelId: string;
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

export interface TrackReelEventsCommand {
  userId: string;
  events: TrackReelEventCommand[];
}

export interface TrackReelEventsResult {
  accepted: number;
  duplicates: number;
  rejected: number;
  countedViews: number;
  rejectedEventIds: string[];
}

@Injectable()
export class TrackReelEventsUseCase {
  private readonly maximumEventAgeMs = 7 * 24 * 60 * 60 * 1000;

  private readonly maximumFutureOffsetMs = 5 * 60 * 1000;

  constructor(
    @Inject('IReelViewEventRepository')
    private readonly repository: IReelViewEventRepository,
  ) {}

  async execute(
    command: TrackReelEventsCommand,
  ): Promise<TrackReelEventsResult> {
    const now = Date.now();
    const userId = command.userId.trim();
    const uniqueEvents: ReelViewEvent[] = [];
    const seenEventIds = new Set<string>();
    const rejectedEventIds: string[] = [];
    let localDuplicates = 0;

    for (const input of command.events) {
      if (seenEventIds.has(input.eventId)) {
        localDuplicates += 1;
        continue;
      }

      seenEventIds.add(input.eventId);

      const occurredAtMs = input.occurredAt.getTime();

      if (
        !Number.isFinite(occurredAtMs) ||
        occurredAtMs < now - this.maximumEventAgeMs ||
        occurredAtMs > now + this.maximumFutureOffsetMs
      ) {
        rejectedEventIds.push(input.eventId);
        continue;
      }

      uniqueEvents.push(
        ReelViewEvent.create({
          ...input,
          userId,
        }),
      );
    }

    if (uniqueEvents.length === 0) {
      return {
        accepted: 0,
        duplicates: localDuplicates,
        rejected: rejectedEventIds.length,
        countedViews: 0,
        rejectedEventIds,
      };
    }

    const persisted = await this.repository.persist(uniqueEvents);

    return {
      accepted: persisted.accepted,
      duplicates: persisted.duplicates + localDuplicates,
      rejected: persisted.rejected + rejectedEventIds.length,
      countedViews: persisted.countedViews,
      rejectedEventIds: [...rejectedEventIds, ...persisted.rejectedEventIds],
    };
  }
}
