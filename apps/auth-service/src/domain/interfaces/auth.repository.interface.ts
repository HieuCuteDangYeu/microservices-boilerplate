import { Role } from '@auth/domain/entities/role.entity';

export interface IAuthRepository {
  assignRole(userId: string, roleName: string): Promise<Role>;
  rollbackRoles(userId: string): Promise<void>;
}
