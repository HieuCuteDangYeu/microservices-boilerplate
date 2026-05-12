import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  content: z.string(),
  type: z.string().default('text'),
  createdAt: z.string().datetime(),
  isRecalled: z.boolean().optional(),
  recalledAt: z.string().datetime().optional(),
  replyToId: z.string().optional(),
  replyPreview: z
    .object({
      senderName: z.string(),
      content: z.string(),
      type: z.enum(['text', 'image', 'video', 'file', 'call']),
    })
    .optional(),
  reactions: z
    .record(
      z.string(),
      z.object({
        emoji: z.string(),
        createdAt: z.string().datetime(),
      }),
    )
    .optional(),
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
