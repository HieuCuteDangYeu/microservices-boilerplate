export interface IAuthService {
  deleteUserRoles(userId: string): void;
  assignRole(userId: string, roleName: string): Promise<void>;
}
