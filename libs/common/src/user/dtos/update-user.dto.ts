import { UserDomainSchema } from '@common/user/dtos/create-user.dto';
import { createZodDto } from 'nestjs-zod';

export class UpdateUserDto extends createZodDto(
  UserDomainSchema.pick({
    email: true,
    password: true,
    picture: true,
  }).partial(),
) {}

export class InternalUpdateUserDto extends createZodDto(
  UserDomainSchema.omit({ id: true, createdAt: true }).partial(),
) {}
