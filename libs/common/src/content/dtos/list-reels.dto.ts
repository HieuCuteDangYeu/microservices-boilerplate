import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ListReelsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      const [createdAt, id] = val.split('|');
      if (!createdAt || !id) return undefined;
      const date = new Date(createdAt);
      if (isNaN(date.getTime())) return undefined;
      return { createdAt: date, id };
    }),
});

export class ListReelsQueryDto extends createZodDto(ListReelsQuerySchema) {}
