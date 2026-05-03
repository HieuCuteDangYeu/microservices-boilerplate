import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ConversationSchema } from './conversation.dto';
import { MessageSchema } from './message.dto';

export const BotChatResponseSchema = z.object({
  message: MessageSchema,
  botReply: MessageSchema.optional(),
  botError: z
    .object({
      code: z.enum(['AI_UNAVAILABLE', 'NO_CONTENT', 'UNKNOWN']),
      message: z.string(),
    })
    .optional(),
  conversation: ConversationSchema.optional(),
  isNewConversation: z.boolean().optional(),
});

export class BotChatResponseDto extends createZodDto(BotChatResponseSchema) {}
