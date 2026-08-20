import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Conversation } from '../../domain/entities/conversation.entity';
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import type {
  ConversationMemberRecord,
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
    private readonly configService: ConfigService,
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

    if (!conversation.isGroup) {
      throw new BadRequestException(
        'Conversation member roles are only supported for groups',
      );
    }

    if (this.isCanonicalProjectionReadEnabled()) {
      return await this.readCanonicalProjection(conversation, requesterUserId);
    }

    if (!conversation.participantIds.includes(requesterUserId)) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    let projectedMembers = [] as Awaited<
      ReturnType<IConversationMemberRepository['listByConversation']>
    >;

    try {
      projectedMembers =
        await this.memberRepository.listByConversation(conversationId);
    } catch {
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

  private isCanonicalProjectionReadEnabled(): boolean {
    const value = this.configService.get<string>(
      'GROUP_V2_CANONICAL_MEMBER_READS_ENABLED',
      'false',
    );

    return ['1', 'true', 'yes', 'on'].includes(
      String(value).trim().toLowerCase(),
    );
  }

  private async readCanonicalProjection(
    conversation: Conversation,
    requesterUserId: string,
  ): Promise<GroupMemberProjectionDto[]> {
    let projectedMembers: ConversationMemberRecord[];

    try {
      projectedMembers = await this.memberRepository.listByConversation(
        conversation.id,
      );
    } catch {
      throw new ServiceUnavailableException(
        'ConversationMember projection is temporarily unavailable',
      );
    }

    const activeMembers = projectedMembers.filter(
      (member) => member.status === 'ACTIVE',
    );
    const legacyIds = Array.from(new Set(conversation.participantIds)).sort();
    const projectedIds = Array.from(
      new Set(activeMembers.map((member) => member.userId)),
    ).sort();
    const ownerIds = activeMembers
      .filter((member) => member.role === 'OWNER')
      .map((member) => member.userId)
      .sort();

    if (
      legacyIds.length !== projectedIds.length ||
      legacyIds.some((userId, index) => userId !== projectedIds[index]) ||
      ownerIds.length !== 1 ||
      ownerIds[0] !== conversation.creatorId ||
      this.hasJoinedAtDrift(conversation, activeMembers)
    ) {
      throw new ConflictException(
        'ConversationMember projection is not consistent enough for canonical reads',
      );
    }

    if (!activeMembers.some((member) => member.userId === requesterUserId)) {
      throw new ForbiddenException(
        'You are not an active participant of this conversation',
      );
    }

    return activeMembers.map((member) => ({
      userId: member.userId,
      role: member.role,
      status: 'ACTIVE',
      joinedAt: member.joinedAt.toISOString(),
      ...(member.invitedBy !== undefined
        ? { invitedBy: member.invitedBy }
        : {}),
    }));
  }

  private hasJoinedAtDrift(
    conversation: Conversation,
    activeMembers: ConversationMemberRecord[],
  ): boolean {
    const fallbackJoinedAt = conversation.createdAt.toISOString();
    const activeByUserId = new Map(
      activeMembers.map((member) => [member.userId, member]),
    );

    return conversation.participantIds.some((userId) => {
      const member = activeByUserId.get(userId);
      if (!member) {
        return true;
      }

      const expectedJoinedAt =
        conversation.memberJoinedAt?.[userId] ?? fallbackJoinedAt;
      return !this.sameInstant(expectedJoinedAt, member.joinedAt.toISOString());
    });
  }

  private sameInstant(left: string, right: string): boolean {
    const leftDate = new Date(left);
    const rightDate = new Date(right);

    if (
      Number.isNaN(leftDate.getTime()) ||
      Number.isNaN(rightDate.getTime())
    ) {
      return left === right;
    }

    return leftDate.getTime() === rightDate.getTime();
  }
}
