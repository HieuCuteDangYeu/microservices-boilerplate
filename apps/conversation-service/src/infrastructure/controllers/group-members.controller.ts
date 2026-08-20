import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { GetGroupMembersUseCase } from '../../application/use-cases/get-group-members.use-case';

@Controller()
export class GroupMembersMicroserviceController {
  private readonly logger = new Logger(GroupMembersMicroserviceController.name);

  constructor(private readonly getGroupMembersUseCase: GetGroupMembersUseCase) {}

  @MessagePattern('get_group_member_projection')
  async handleGetGroupMemberProjection(
    @Payload() data: { conversationId: string; requesterUserId: string },
  ) {
    try {
      return await this.getGroupMembersUseCase.execute(
        data.conversationId,
        data.requesterUserId,
      );
    } catch (error) {
      const resolved = error as Error;
      this.logger.error(
        `❌ [GetGroupMemberProjection] Error: ${resolved.message}`,
      );
      throw new RpcException(resolved.message);
    }
  }
}
