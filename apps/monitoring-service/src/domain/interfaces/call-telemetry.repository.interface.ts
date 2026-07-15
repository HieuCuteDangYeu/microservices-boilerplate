import type {
  CallTelemetryTimelineEvent,
  RecentCallLeg,
  StoredCallTelemetryEvent,
  TelemetryQuery,
} from '../models/call-telemetry.model';

export interface ICallTelemetryRepository {
  create(events: StoredCallTelemetryEvent[]): Promise<number>;
  findEvents(query: TelemetryQuery): Promise<StoredCallTelemetryEvent[]>;
  findTimeline(callId: string): Promise<CallTelemetryTimelineEvent[]>;
  findRecentCallLegs(query: TelemetryQuery): Promise<RecentCallLeg[]>;
  deleteReceivedBefore(cutoff: Date): Promise<number>;
}
