import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ConversationTypeSchema = z.enum(['DIRECT', 'GROUP']);

export const CreateConversationSchema = z
  .object({
    // The authenticated creator is injected server-side, so callers only need
    // to provide at least one target participant.
    participantIds: z
      .array(z.string().trim().min(1))
      .min(1, 'At least 1 target participant required'),
    type: ConversationTypeSchema.optional(),
    // Backward-compatible internal contract used by existing services.
    isGroup: z.boolean().optional(),
    name: z.string().trim().min(1).max(100).optional(),
    picture: z.string().trim().min(1).max(2048).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === undefined || value.isGroup === undefined) {
      return;
    }

    const typeIsGroup = value.type === 'GROUP';
    if (typeIsGroup !== value.isGroup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'type and isGroup must describe the same conversation kind',
        path: ['type'],
      });
    }
  });

export class CreateConversationDto extends createZodDto(
  CreateConversationSchema,
) {}
