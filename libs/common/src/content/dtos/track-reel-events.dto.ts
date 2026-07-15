import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const ReelViewEventTypeSchema = z.enum([
  'IMPRESSION',
  'WATCH_START',
  'WATCH_PROGRESS',
  'WATCH_END',
  'SKIP',
  'COMPLETE',
  'REPLAY',
  'PAUSE',
  'RESUME',
  'MUTE',
  'UNMUTE',
]);

export const ReelEventSourceSchema = z.enum([
  'RECOMMENDED',
  'FRIENDS',
  'PUBLIC_FEED',
  'PROFILE',
  'SEARCH',
  'SHARED',
  'DIRECT',
  'UNKNOWN',
]);

export const ReelEventRecommendationSchema = z.object({
  recommendationId: uuidSchema,
  feedSessionId: uuidSchema,
  algorithmVersion: z.string().trim().min(1).max(120),
  candidateSource: z.string().trim().min(1).max(120),
  rank: z.coerce.number().int().min(1).max(10000),
  generatedAt: z.string().datetime({
    offset: true,
  }),
});

export const TrackReelEventSchema = z.object({
  eventId: uuidSchema,
  reelId: uuidSchema,
  playbackSessionId: uuidSchema,
  sequence: z.coerce.number().int().min(0).max(1_000_000),
  eventType: ReelViewEventTypeSchema,
  source: ReelEventSourceSchema.default('UNKNOWN'),
  occurredAt: z.string().datetime({
    offset: true,
  }),
  watchMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .optional(),
  durationMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .optional(),
  percentageWatched: z.coerce.number().min(0).max(100).optional(),
  muted: z.boolean().optional(),
  completed: z.boolean().optional(),
  replayed: z.boolean().optional(),
  skipped: z.boolean().optional(),
  recommendation: ReelEventRecommendationSchema.optional(),
});

export const TrackReelEventsSchema = z.object({
  events: z.array(TrackReelEventSchema).min(1).max(50),
});

export type ReelViewEventType = z.infer<typeof ReelViewEventTypeSchema>;

export type ReelEventSource = z.infer<typeof ReelEventSourceSchema>;

export type ReelEventRecommendation = z.infer<
  typeof ReelEventRecommendationSchema
>;

export type TrackReelEventPayload = z.infer<typeof TrackReelEventSchema>;

export type TrackReelEventsPayload = z.infer<typeof TrackReelEventsSchema>;

export class TrackReelEventsDto extends createZodDto(TrackReelEventsSchema) {}
