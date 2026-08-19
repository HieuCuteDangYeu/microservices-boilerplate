import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateGroupConversationSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    picture: z
      .union([z.string().trim().min(1).max(2048), z.null()])
      .optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.picture !== undefined,
    'At least one group field must be provided',
  );

export class UpdateGroupConversationDto extends createZodDto(
  UpdateGroupConversationSchema,
) {}
