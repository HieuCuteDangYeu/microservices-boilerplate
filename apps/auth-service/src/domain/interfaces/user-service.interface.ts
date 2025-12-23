import { LoginDto } from '@common/auth/dtos/login.dto';
import { RegisterDto } from '@common/auth/dtos/register.dto';
import { CreateUserResponse } from '@common/user/interfaces/create-user-response.types';

export interface IUserService {
  createUser(id: string, dto: RegisterDto): Promise<CreateUserResponse>;
  validateUser(dto: LoginDto): Promise<{ id: string; email: string } | null>;
}
