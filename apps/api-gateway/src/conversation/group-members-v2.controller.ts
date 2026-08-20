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

type ConversationParticipantPayload = {
  id: string;
  email?: string;
  name?: string;
  fullName?: string;
  picture?: string;
  avatar?: string;
};

type ConversationDetailProjection = {
  participants?: ConversationParticipantPayload[];
};

export type GroupMemberV2Response = GroupMemberProjectionResponse & {
  user: {
    id: string;
    email: string;
    name?: string;
    fullName?: string;
    picture?: string;
  };
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
      'V2 additive group member contract. Existing /members contract remains unchanged.',
  })
  async getGroupMemberProjection(
    @Param('id') conversationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<GroupMemberV2Response[]> {
    const [members, conversation] = await Promise.all([
      lastValueFrom(
        this.conversationClient.send<GroupMemberProjectionResponse[]>(
          'get_group_member_projection',
          {
            conversationId,
            requesterUserId: user.id,
          },
        ),
      ),
      lastValueFrom(
        this.conversationClient.send<ConversationDetailProjection>(
          'get_conversation_detail',
          {
            id: conversationId,
            userId: user.id,
          },
        ),
      ),
    ]);

    const participantById = new Map(
      (conversation.participants ?? []).map((participant) => [
        participant.id,
        participant,
      ]),
    );

    return members.map((member) => {
      const participant = participantById.get(member.userId);
      const picture = participant?.picture ?? participant?.avatar;

      return {
        ...member,
        user: {
          id: member.userId,
          email: participant?.email ?? '',
          ...(participant?.name ? { name: participant.name } : {}),
          ...(participant?.fullName ? { fullName: participant.fullName } : {}),
          ...(picture ? { picture } : {}),
        },
      };
    });
  }
}
