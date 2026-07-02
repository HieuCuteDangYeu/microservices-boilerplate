import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    'Invalid UUID format',
  );

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

export const TrackReelEventSchema = z.object({
  reelId: uuidSchema,
  sessionId: z.string().min(1).max(120).optional(),
  eventType: ReelViewEventTypeSchema,
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
});

export const TrackReelEventsSchema = z.object({
  events: z.array(TrackReelEventSchema).min(1).max(50),
});

export type ReelViewEventType = z.infer<typeof ReelViewEventTypeSchema>;
export type TrackReelEventPayload = z.infer<typeof TrackReelEventSchema>;
export type TrackReelEventsPayload = z.infer<typeof TrackReelEventsSchema>;

export class TrackReelEventsDto extends createZodDto(TrackReelEventsSchema) {}
