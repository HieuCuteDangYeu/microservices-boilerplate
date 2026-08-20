import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const MessageReactionActorSchema = z.object({
  id: z.string(),
  fullName: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  picture: z.string().nullable().optional(),
});

export const MessageReactionDetailSchema = z.object({
  userId: z.string(),
  emoji: z.string(),
  createdAt: z.string().datetime(),
  user: MessageReactionActorSchema.nullable(),
});

export const MessageReactionDetailsSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  total: z.number().int().nonnegative(),
  reactions: z.array(MessageReactionDetailSchema),
});

export class MessageReactionDetailsDto extends createZodDto(
  MessageReactionDetailsSchema,
) {}
