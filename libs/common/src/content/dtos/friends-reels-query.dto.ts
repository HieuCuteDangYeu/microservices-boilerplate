import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const cursorSchema = z.string().transform((value, context) => {
  const [createdAt, id] = value.split('|');

  if (!createdAt || !id) {
    context.addIssue({
      code: 'custom',
      message: 'Invalid cursor format',
    });

    return z.NEVER;
  }

  const parsedCreatedAt = new Date(createdAt);

  if (Number.isNaN(parsedCreatedAt.getTime())) {
    context.addIssue({
      code: 'custom',
      message: 'Invalid cursor format',
    });

    return z.NEVER;
  }

  return {
    createdAt: parsedCreatedAt,
    id,
  };
});

export const FriendsReelsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: cursorSchema.optional(),
});

export class FriendsReelsQueryDto extends createZodDto(
  FriendsReelsQuerySchema,
) {}
