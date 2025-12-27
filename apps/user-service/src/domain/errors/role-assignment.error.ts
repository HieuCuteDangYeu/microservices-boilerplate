export class RoleAssignmentError extends Error {
  constructor(userId: string) {
    super(`Failed to assign role to user ${userId}`);
    this.name = 'RoleAssignmentError';
  }
}
