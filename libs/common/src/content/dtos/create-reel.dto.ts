import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateReelSchema = z.object({
  mediaKey: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export class CreateReelDto extends createZodDto(CreateReelSchema) {}
