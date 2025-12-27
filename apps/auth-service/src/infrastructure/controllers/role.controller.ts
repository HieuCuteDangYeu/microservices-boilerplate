import { AssignRoleUseCase } from '@auth/application/use-cases/assign-role.use-case';
import { DeleteUserRolesUseCase } from '@auth/application/use-cases/delete-user-roles.use-case';
import { Controller } from '@nestjs/common';
import {
  EventPattern,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';

@Controller()
export class RoleController {
  constructor(
    private readonly assignRoleUseCase: AssignRoleUseCase,
    private readonly deleteUserRolesUseCase: DeleteUserRolesUseCase,
  ) {}

  @MessagePattern('auth.assign_role')
  async assignRole(userId: string, roleName: string): Promise<void> {
    try {
      await this.assignRoleUseCase.execute(userId, roleName);
    } catch (error) {
      console.error(error);
      throw new RpcException('Failed to assign role');
    }
  }

  @EventPattern('auth.delete_user_roles')
  async deleteUserRoles(@Payload() data: { userId: string }) {
    await this.deleteUserRolesUseCase.execute(data.userId);
  }
}
