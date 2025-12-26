import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ConfirmAccountSchema = z.object({
  token: z.string().min(1),
});

export class ConfirmAccountDto extends createZodDto(ConfirmAccountSchema) {}
