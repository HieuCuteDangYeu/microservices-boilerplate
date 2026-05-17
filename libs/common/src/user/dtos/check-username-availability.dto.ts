import { createZodDto } from 'nestjs-zod';
import z from 'zod';

const CheckUsernameAvailabilitySchema = z.object({
  username: z.string().trim().min(1).max(64),
});

export class CheckUsernameAvailabilityDto extends createZodDto(
  CheckUsernameAvailabilitySchema,
) {}
