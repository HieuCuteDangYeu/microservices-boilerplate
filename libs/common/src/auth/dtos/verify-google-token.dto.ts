import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const VerifyGoogleTokenSchema = z.object({
  idToken: z.string().min(1),
});

export class VerifyGoogleTokenDto extends createZodDto(
  VerifyGoogleTokenSchema,
) {}
