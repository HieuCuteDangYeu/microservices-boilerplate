export interface IUserRoleRepository {
  setUserRoles(userId: string, roles: string[]): Promise<void>;
  getUserRoles(userId: string): Promise<string[] | null>;
  invalidateUserRoles(userId: string): Promise<void>;
}
