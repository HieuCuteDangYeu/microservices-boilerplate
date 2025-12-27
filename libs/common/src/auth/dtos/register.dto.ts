import { UserDomainSchema } from '@common/user/schemas/user.schema';
import { createZodDto } from 'nestjs-zod';

export class RegisterDto extends createZodDto(
  UserDomainSchema.pick({ email: true, password: true }),
) {}
