import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  content: z.string(),
  type: z.string().default('text'),
  signalType: z.number().int().optional(),
  createdAt: z.string().datetime(),
  createdAtMs: z.number().int(),
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
