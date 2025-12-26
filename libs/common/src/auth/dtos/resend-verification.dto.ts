import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ResendVerificationSchema = z.object({
  email: z.email(),
});

export class ResendVerificationDto extends createZodDto(
  ResendVerificationSchema,
) {}
