import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const AddReactionSchema = z.object({
  emoji: z.string().min(1, 'Emoji is required'),
});

export class AddReactionDto extends createZodDto(AddReactionSchema) {}
