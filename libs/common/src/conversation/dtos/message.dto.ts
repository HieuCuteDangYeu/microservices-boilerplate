import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MessageMediaSchema } from './message-media.schema';

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  clientMessageId: z.string().optional(),
  content: z.string(),
  media: MessageMediaSchema.optional(),
  type: z.string().default('text'),
  signalType: z.number().int().optional(),
  createdAt: z.string().datetime(),
  isRecalled: z.boolean().optional(),
  recalledAt: z.string().datetime().optional(),
  replyToId: z.string().optional(),
  replyPreview: z
    .object({
      senderName: z.string(),
      content: z.string(),
      thumbnailUri: z.string().optional(),
      mediaWidth: z.number().optional(),
      mediaHeight: z.number().optional(),
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
