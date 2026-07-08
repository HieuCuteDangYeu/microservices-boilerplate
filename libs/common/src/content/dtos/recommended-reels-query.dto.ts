import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const booleanQuerySchema = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    return value.toLowerCase() === 'true';
  });

export const RecommendedReelsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  excludeRecentlySeen: booleanQuerySchema.default(true),
  cursor: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;

      const [createdAt, id] = val.split('|');

      if (!createdAt || !id) return undefined;

      const date = new Date(createdAt);

      if (Number.isNaN(date.getTime())) return undefined;

      return { createdAt: date, id };
    }),
});

export class RecommendedReelsQueryDto extends createZodDto(
  RecommendedReelsQuerySchema,
) {}
