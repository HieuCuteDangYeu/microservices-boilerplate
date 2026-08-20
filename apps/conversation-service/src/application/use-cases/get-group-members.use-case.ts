import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import type {
  ConversationMemberRole,
  IConversationMemberRepository,
} from '../../domain/interfaces/conversation-member.repository.interface';

export type GroupMemberProjectionDto = {
  userId: string;
  role: ConversationMemberRole;
  status: 'ACTIVE';
  joinedAt: string;
  invitedBy?: string | null;
};

@Injectable()
export class GetGroupMembersUseCase {
  constructor(
    @Inject('IChatRepository')
    private readonly chatRepository: IChatRepository,
    @Inject('IConversationMemberRepository')
    private readonly memberRepository: IConversationMemberRepository,
  ) {}

  async execute(
    conversationId: string,
    requesterUserId: string,
  ): Promise<GroupMemberProjectionDto[]> {
    const conversation =
      await this.chatRepository.findConversation(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.participantIds.includes(requesterUserId)) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    if (!conversation.isGroup) {
      throw new BadRequestException(
        'Conversation member roles are only supported for groups',
      );
    }

    let projectedMembers = [] as Awaited<
      ReturnType<IConversationMemberRepository['listByConversation']>
    >;

    try {
      projectedMembers =
        await this.memberRepository.listByConversation(conversationId);
    } catch {
      // Stage 1 compatibility: participantIds/creatorId/memberJoinedAt remain
      // authoritative until the projection backfill and runtime verification
      // are complete. Existing member-list APIs must keep working if the V2
      // projection is temporarily unavailable.
      projectedMembers = [];
    }

    const projectionByUserId = new Map(
      projectedMembers.map((member) => [member.userId, member]),
    );
    const fallbackJoinedAt = conversation.createdAt.toISOString();

    return conversation.participantIds.map((userId) => {
      const projected = projectionByUserId.get(userId);
      const legacyJoinedAt = conversation.memberJoinedAt?.[userId];
      const role: ConversationMemberRole =
        userId === conversation.creatorId
          ? 'OWNER'
          : projected?.status === 'ACTIVE' && projected.role === 'ADMIN'
            ? 'ADMIN'
            : 'MEMBER';

      return {
        userId,
        role,
        status: 'ACTIVE',
        joinedAt:
          legacyJoinedAt ?? projected?.joinedAt.toISOString() ?? fallbackJoinedAt,
        ...(projected?.invitedBy !== undefined
          ? { invitedBy: projected.invitedBy }
          : {}),
      };
    });
  }
}
