import { createZodDto } from 'nestjs-zod';
import { UserDomainSchema } from '../schemas/user.schema';

export class CreateUserDto extends createZodDto(
  UserDomainSchema.pick({ email: true, password: true }),
) {}

export class CreateUserPayloadDto extends createZodDto(
  UserDomainSchema.pick({
    id: true,
    email: true,
    password: true,
    provider: true,
    providerId: true,
    picture: true,
    isVerified: true,
  }),
) {}
