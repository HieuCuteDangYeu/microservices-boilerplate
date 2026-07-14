import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RecommendationTelemetrySummaryQuerySchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    recommendationType: z.enum(['REEL', 'USER']).optional(),
    algorithmVersion: z.string().trim().min(1).max(64).optional(),
    candidateSource: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const from = new Date(value.from);
    const to = new Date(value.to);

    if (from.getTime() > to.getTime()) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'to must be greater than or equal to from',
      });

      return;
    }

    const maximumRangeMs = 31 * 24 * 60 * 60 * 1000;

    if (to.getTime() - from.getTime() > maximumRangeMs) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Telemetry summary range cannot exceed 31 days',
      });
    }
  });

export class RecommendationTelemetrySummaryQueryDto extends createZodDto(
  RecommendationTelemetrySummaryQuerySchema,
) {}
