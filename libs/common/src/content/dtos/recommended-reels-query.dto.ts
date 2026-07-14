import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const booleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    return value === true || value === 'true';
  });

const cursorSchema = z.string().transform((value, context) => {
  const [createdAt, id] = value.split('|');

  if (!createdAt || !id) {
    context.addIssue({
      code: 'custom',
      message: 'Invalid cursor format',
    });

    return z.NEVER;
  }

  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    context.addIssue({
      code: 'custom',
      message: 'Invalid cursor format',
    });

    return z.NEVER;
  }

  return {
    createdAt: date,
    id,
  };
});

export const RecommendedReelsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  excludeRecentlySeen: booleanQuerySchema.default(true),
  feedSessionId: z.string().uuid().optional(),
  cursor: cursorSchema.optional(),
});

export class RecommendedReelsQueryDto extends createZodDto(
  RecommendedReelsQuerySchema,
) {}
