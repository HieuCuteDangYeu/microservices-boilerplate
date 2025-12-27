import { createZodDto } from 'nestjs-zod';
import { UserDomainSchema } from '../schemas/user.schema';

export class UpdateUserDto extends createZodDto(
  UserDomainSchema.pick({
    email: true,
    password: true,
    picture: true,
    firstName: true,
    lastName: true,
  }).partial(),
) {}

export class InternalUpdateUserDto extends createZodDto(
  UserDomainSchema.omit({ id: true, createdAt: true }).partial(),
) {}
