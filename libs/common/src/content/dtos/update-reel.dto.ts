import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateReelSchema = z
  .object({
    title: z.string().max(220).optional(),
    description: z.string().max(2000).optional(),
    tags: z.array(z.string().max(50)).max(30).optional(),
    visibility: z.enum(['public', 'private']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export class UpdateReelDto extends createZodDto(UpdateReelSchema) {}
