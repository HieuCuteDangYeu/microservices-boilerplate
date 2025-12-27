import { UserDomainSchema } from '@common/user/schemas/user.schema';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(
  UserDomainSchema.pick({ email: true, password: true }),
) {}
