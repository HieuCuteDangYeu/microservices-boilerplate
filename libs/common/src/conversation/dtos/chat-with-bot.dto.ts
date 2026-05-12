import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ChatWithBotSchema = z.object({
  type: z
    .enum(['text', 'image', 'video', 'file', 'call'])
    .optional()
    .default('text'),
  signalType: z
    .number()
    .int()
    .refine((val) => [0, 1, 3].includes(val), {
      message:
        'Signal Type must be 0 (Normal), 1 (Whisper) or 3 (PreKeyWhisper)',
    }),
  content: z.string().min(1, 'Content cannot be empty'),
  registrationId: z.number().int().optional(),
});

export class ChatWithBotDto extends createZodDto(ChatWithBotSchema) {}
