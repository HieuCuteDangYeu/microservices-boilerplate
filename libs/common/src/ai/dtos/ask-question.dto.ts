import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AskQuestionPayloadSchema = z.object({
  message: z.string().min(1),
  userId: z.string(),
});

export class AskQuestionPayload extends createZodDto(
  AskQuestionPayloadSchema,
) {}
