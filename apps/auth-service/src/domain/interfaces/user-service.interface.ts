import { RegisterDto } from '@common/auth/dtos/register.dto';
import { CreateUserResponse } from '@common/user/interfaces/create-user-response.types';

export interface IUserService {
  createUser(id: string, dto: RegisterDto): Promise<CreateUserResponse>;
}
