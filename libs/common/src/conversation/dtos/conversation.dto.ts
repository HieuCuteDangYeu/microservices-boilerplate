import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ConversationSchema = z.object({
  id: z.string(),
  participantIds: z.array(z.string()),
  lastMessage: z.string().optional().nullable(),
  lastMessageAt: z.string().datetime().optional().nullable(),
  isGroup: z.boolean(),
  updatedAt: z.string().datetime(),
});

export class ConversationDto extends createZodDto(ConversationSchema) {}
