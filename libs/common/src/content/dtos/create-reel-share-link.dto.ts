import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateReelShareLinkSchema = z.object({
  expiresInDays: z
    .number()
    .int()
    .min(1, 'expiresInDays must be at least 1')
    .max(365, 'expiresInDays must be at most 365')
    .optional(),
  reuseExisting: z.boolean().optional().default(true),
});

export class CreateReelShareLinkDto extends createZodDto(
  CreateReelShareLinkSchema,
) {}
