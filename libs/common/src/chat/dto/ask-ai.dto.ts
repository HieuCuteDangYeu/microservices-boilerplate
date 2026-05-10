import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const AskAiSchema = z.object({
  message: z.string().min(1),
});

export class AskAiDto extends createZodDto(AskAiSchema) {}
