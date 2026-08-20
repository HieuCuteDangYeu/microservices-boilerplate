import { CurrentUser } from '@common/auth/decorators/current-user.decorator';
import type { AuthUser } from '@common/auth/interfaces/auth-user.interface';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { lastValueFrom } from 'rxjs';

type GroupMemberProjectionResponse = {
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: 'ACTIVE';
  joinedAt: string;
  invitedBy?: string | null;
};

@ApiTags('Conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GroupMembersV2Controller {
  constructor(
    @Inject('CONVERSATION_SERVICE')
    private readonly conversationClient: ClientProxy,
  ) {}

  @Get(':id/members/v2')
  @ApiOperation({
    summary:
      'V2 additive group member projection. Existing /members contract remains unchanged.',
  })
  async getGroupMemberProjection(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<GroupMemberProjectionResponse[]> {
    return await lastValueFrom(
      this.conversationClient.send<GroupMemberProjectionResponse[]>(
        'get_group_member_projection',
        {
          conversationId,
          requesterUserId: user.id,
        },
      ),
    );
  }
}
