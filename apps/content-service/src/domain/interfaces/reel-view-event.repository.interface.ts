import type { ReelViewEvent } from '@content/domain/entities/reel-view-event.entity';

export interface PersistReelViewEventsResult {
  accepted: number;
  duplicates: number;
  rejected: number;
  countedViews: number;
  rejectedEventIds: string[];
}

export interface IReelViewEventRepository {
  persist(events: ReelViewEvent[]): Promise<PersistReelViewEventsResult>;
}
