import { z } from 'zod';

export const AskQuestionResponseSchema = z.object({
  answer: z.string().optional(),
  error: z
    .object({
      code: z.enum(['AI_UNAVAILABLE', 'NO_CONTENT', 'UNKNOWN']),
      message: z.string(),
    })
    .optional(),
});

export type AskQuestionResponse = z.infer<typeof AskQuestionResponseSchema>;
