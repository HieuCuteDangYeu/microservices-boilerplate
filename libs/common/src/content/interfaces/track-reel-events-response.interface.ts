export interface TrackReelEventsResponse {
  success: true;
  accepted: number;
  duplicates: number;
  rejected: number;
  countedViews: number;
  rejectedEventIds: string[];
}
