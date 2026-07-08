import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const LogoutSchema = z.object({
  pushToken: z.string().min(1).optional(),
});

export class LogoutDto extends createZodDto(LogoutSchema) {}
