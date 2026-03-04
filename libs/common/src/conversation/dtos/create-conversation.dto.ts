import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateConversationSchema = z.object({
  participantIds: z
    .array(z.string())
    .min(2, 'At least 2 participants required'),

  isGroup: z.boolean().default(false),
});

export class CreateConversationDto extends createZodDto(
  CreateConversationSchema,
) {}
