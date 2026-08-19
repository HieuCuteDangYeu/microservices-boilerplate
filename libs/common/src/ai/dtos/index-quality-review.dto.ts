import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const IndexQualityReviewDocumentSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['REEL', 'SECTION', 'CHUNK', 'VISUAL_SCENE']),
    ordinal: z.number().int().nonnegative(),
    parentId: z.string().min(1).optional(),
    startTime: z.number().nonnegative().optional(),
    endTime: z.number().nonnegative().optional(),
    evidenceQuality: z.enum(['VERIFIED', 'LOW_CONFIDENCE', 'METADATA_ONLY']),
    text: z.string().min(1).max(1_200),
  })
  .strict()
  .refine(
    (value) =>
      value.startTime === undefined ||
      value.endTime === undefined ||
      value.endTime >= value.startTime,
    { message: 'endTime must be greater than or equal to startTime' },
  );

export const IndexQualityReviewSchema = z
  .object({
    reelId: z.string().min(1),
    sourceLengthClass: z.enum(['SHORT', 'LONG']),
    durationMs: z.number().positive(),
    title: z.string().max(500).optional(),
    description: z.string().max(5_000).optional(),
    tags: z.array(z.string().min(1).max(100)).max(50),
    documents: z.array(IndexQualityReviewDocumentSchema).min(1).max(80),
  })
  .strict();

export class IndexQualityReviewDto extends createZodDto(
  IndexQualityReviewSchema,
) {}
