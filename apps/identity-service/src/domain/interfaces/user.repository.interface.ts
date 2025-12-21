import { UserResponse } from '@common/interfaces/find-all-users.types';
import { User } from '../entities/user.entity';

export interface IUserRepository {
  save(user: User): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findAll(
    skip: number,
    limit: number,
  ): Promise<{ users: UserResponse[]; total: number }>;
}
