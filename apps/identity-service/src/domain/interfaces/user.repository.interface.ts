import { UserResponse } from '@common/interfaces/find-all-users.types';
import { User } from '../entities/user.entity';

export interface FindAllParams {
  skip: number;
  limit: number;
  search?: string;
  sort?: 'asc' | 'desc';
}

export interface IUserRepository {
  save(user: User): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findAll(
    params: FindAllParams,
  ): Promise<{ users: UserResponse[]; total: number }>;
}
