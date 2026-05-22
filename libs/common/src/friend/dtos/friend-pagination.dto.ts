import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const FriendPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).optional(),
});

export class FriendPaginationDto extends createZodDto(FriendPaginationSchema) {}
