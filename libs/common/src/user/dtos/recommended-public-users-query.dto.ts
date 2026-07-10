import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const RecommendedPublicUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(20),
});

export class RecommendedPublicUsersQueryDto extends createZodDto(
  RecommendedPublicUsersQuerySchema,
) {}
