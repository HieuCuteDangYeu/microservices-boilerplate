import { createZodDto } from 'nestjs-zod/dto';
import z from 'zod';

const CreateSocialUserSchema = z.object({
  email: z.email(),
  picture: z.url().optional().or(z.string().optional()),
  provider: z.string().min(1),
  providerId: z.string().min(1),
  isVerified: z.boolean().default(true),
});

export class CreateSocialUserDto extends createZodDto(CreateSocialUserSchema) {}
