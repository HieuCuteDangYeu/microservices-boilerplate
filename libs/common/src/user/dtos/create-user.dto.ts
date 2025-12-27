import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const UserDomainSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  password: z.string().min(8),
  picture: z.url().optional(),
  isVerified: z.boolean().default(false),
  role: z.string().optional().default('USER'),
  provider: z.string().optional(),
  providerId: z.string().optional(),
});

export class CreateUserDto extends createZodDto(
  UserDomainSchema.pick({
    email: true,
    password: true,
    role: true,
  }),
) {}

export class CreateUserPayloadDto extends createZodDto(
  UserDomainSchema.pick({
    email: true,
    password: true,
    picture: true,
    isVerified: true,
    provider: true,
    providerId: true,
  }),
) {}
