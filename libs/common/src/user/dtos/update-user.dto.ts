import { UserDomainSchema } from '@common/user/dtos/create-user.dto';
import { createZodDto } from 'nestjs-zod';

export class UpdateUserDto extends createZodDto(
  UserDomainSchema.pick({
    email: true,
    password: true,
    fullName: true,
    username: true,
  }).partial(),
) {}

export class InternalUpdateUserDto extends createZodDto(
  UserDomainSchema.omit({ id: true, createdAt: true, role: true }).partial(),
) {}
