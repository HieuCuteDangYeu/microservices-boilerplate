import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

export class ResetPasswordDto extends createZodDto(ResetPasswordSchema) {}
