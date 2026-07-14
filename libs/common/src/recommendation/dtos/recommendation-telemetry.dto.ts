import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RecommendationTelemetryEventSchema = z
  .object({
    eventId: z.string().uuid(),
    recommendationType: z.enum(['REEL', 'USER']),
    algorithmVersion: z.string().trim().min(1).max(64),
    feedSessionId: z.string().uuid(),
    route: z.string().trim().min(1).max(200),
    candidateSource: z.string().trim().min(1).max(100),
    requestedLimit: z.number().int().min(1).max(100),
    returnedItems: z.number().int().min(0).max(10_000),
    latencyMs: z.number().int().min(0).max(300_000),
    outcome: z.enum(['SUCCEEDED', 'FAILED']),
    errorCode: z.string().trim().min(1).max(100).optional(),
    featureFlags: z.record(z.string().trim().min(1).max(100), z.boolean()),
    occurredAt: z.string().datetime(),
  })
  .strict();

export const TrackRecommendationTelemetrySchema = z
  .object({
    events: z.array(RecommendationTelemetryEventSchema).min(1).max(50),
  })
  .strict();

export class TrackRecommendationTelemetryDto extends createZodDto(
  TrackRecommendationTelemetrySchema,
) {}
