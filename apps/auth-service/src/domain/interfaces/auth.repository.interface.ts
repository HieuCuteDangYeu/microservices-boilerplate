import { RefreshToken } from '@auth/domain/entities/refresh-token.entity';
import { Role } from '@auth/domain/entities/role.entity';

export interface IAuthRepository {
  assignRole(userId: string, roleName: string): Promise<Role>;
  rollbackRoles(userId: string): Promise<void>;
  createRefreshToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<RefreshToken>;
  getUserRole(userId: string): Promise<string>;
}
