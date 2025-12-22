import { CreateUserSchema } from '@common/user/dtos/create-user.dto';
import { createZodDto } from 'nestjs-zod';

const updateUserSchema = CreateUserSchema.partial();

export class UpdateUserDto extends createZodDto(updateUserSchema) {}
