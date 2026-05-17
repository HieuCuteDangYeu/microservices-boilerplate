import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const FullNameSchema = z.string().trim().min(1).max(80);
export const UsernameSchema = z.string().trim().min(1).max(31);

export const UserDomainSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  password: z.string().min(8),
  fullName: FullNameSchema,
  username: UsernameSchema,
  picture: z.url().optional(),
  isVerified: z.boolean().default(false),
  role: z.string().optional().default('USER'),
  provider: z.string().optional(),
  providerId: z.string().optional(),
  createdAt: z.date().optional(),
});

export class CreateUserDto extends createZodDto(
  UserDomainSchema.pick({
    email: true,
    password: true,
    fullName: true,
    username: true,
    role: true,
  }).partial({
    fullName: true,
    username: true,
  }),
) {}

export class CreateUserPayloadDto extends createZodDto(
  UserDomainSchema.pick({
    email: true,
    password: true,
    fullName: true,
    username: true,
    picture: true,
    isVerified: true,
    role: true,
    provider: true,
    providerId: true,
  }).partial({
    fullName: true,
    username: true,
    picture: true,
    isVerified: true,
    role: true,
    provider: true,
    providerId: true,
  }),
) {}
