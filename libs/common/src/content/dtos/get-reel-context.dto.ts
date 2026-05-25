import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const GetReelContextQuerySchema = z.object({
  source: z.enum(['profile']).default('profile'),
  before: z.coerce.number().int().min(0).max(20).default(1),
  after: z.coerce.number().int().min(0).max(20).default(5),
});

export class GetReelContextQueryDto extends createZodDto(
  GetReelContextQuerySchema,
) {}
