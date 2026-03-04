import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  content: z.string(),
  type: z.string().default('text'),
  createdAt: z.string().datetime(),
  readBy: z
    .array(
      z.object({
        userId: z.string(),
        at: z.string().datetime(),
      }),
    )
    .optional(),
});

export class MessageDto extends createZodDto(MessageSchema) {}
