import { UserDomainSchema } from '@common/user/dtos/create-user.dto';
import { createZodDto } from 'nestjs-zod';

export class LoginDto extends createZodDto(
  UserDomainSchema.pick({ email: true, password: true }),
) {}
