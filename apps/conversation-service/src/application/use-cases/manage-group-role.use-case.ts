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
  IConversationMemberRepository,
} from '../../domain/interfaces/conversation-member.repository.interface';
import { evaluateGroupPermission } from '../policies/group-permission.policy';
import type { GroupMemberProjectionDto } from './get-group-members.use-case';

export type GroupRoleMutationResult = {
  conversation: Conversation;
  member: GroupMemberProjectionDto;
};

@Injectable()
export class ManageGroupRoleUseCase {
  constructor(
    @Inject('IChatRepository')
    private readonly chatRepository: IChatRepository,
    @Inject('IConversationMemberRepository')
    private readonly memberRepository: IConversationMemberRepository,
    private readonly configService: ConfigService,
  ) {}

  async updateRole(input: {
    conversationId: string;
    actorUserId: string;
    targetUserId: string;
    role: 'ADMIN' | 'MEMBER';
  }): Promise<GroupRoleMutationResult> {
    this.assertRoleMutationsEnabled();

    const conversationId = input.conversationId.trim();
    const actorUserId = input.actorUserId.trim();
    const targetUserId = input.targetUserId.trim();

    if (!conversationId || !actorUserId || !targetUserId) {
      throw new BadRequestException(
        'conversationId, actorUserId and targetUserId are required',
      );
    }

    const conversation = await this.loadGroup(conversationId);
    this.assertLegacyOwnerAndTarget(conversation, actorUserId, targetUserId);

    const members = await this.loadProjection(conversationId);
    const targetMember = members.find(
      (member) => member.userId === targetUserId && member.status === 'ACTIVE',
    );

    if (!targetMember) {
      throw new ConflictException(
        'ConversationMember projection is not ready for this member',
      );
    }

    if (targetMember.role === 'OWNER') {
      throw new BadRequestException('The group owner role cannot be changed');
    }

    if (targetMember.role === input.role) {
      return {
        conversation,
        member: this.toDto(targetMember),
      };
    }

    const permission =
      input.role === 'ADMIN' ? 'PROMOTE_MEMBER' : 'DEMOTE_ADMIN';
    const decision = evaluateGroupPermission({
      actorRole: 'OWNER',
      permission,
      targetRole: targetMember.role,
    });

    if (!decision.allowed) {
      throw new BadRequestException(decision.reason ?? 'Role change is invalid');
    }

    const changed = await this.memberRepository.changeRoleAsLegacyOwner(
      conversationId,
      actorUserId,
      targetUserId,
      targetMember.role,
      input.role,
    );

    if (!changed) {
      const currentConversation = await this.loadGroup(conversationId);
      const currentMembers = await this.loadProjection(conversationId);
      const currentTarget = currentMembers.find(
        (member) => member.userId === targetUserId && member.status === 'ACTIVE',
      );

      if (
        currentConversation.creatorId === actorUserId &&
        currentConversation.participantIds.includes(targetUserId) &&
        currentTarget?.role === input.role
      ) {
        return {
          conversation: currentConversation,
          member: this.toDto(currentTarget),
        };
      }

      throw new ConflictException(
        'Group ownership, membership, or member role changed; refresh and try again',
      );
    }

    const [updatedConversation, updatedMembers] = await Promise.all([
      this.loadGroup(conversationId),
      this.loadProjection(conversationId),
    ]);
    const updatedTarget = updatedMembers.find(
      (member) => member.userId === targetUserId && member.status === 'ACTIVE',
    );

    if (!updatedTarget || updatedTarget.role !== input.role) {
      throw new ConflictException(
        'Group role projection did not converge after the mutation',
      );
    }

    return {
      conversation: updatedConversation,
      member: this.toDto(updatedTarget),
    };
  }

  private assertRoleMutationsEnabled(): void {
    const value = this.configService.get<string>(
      'GROUP_V2_ROLE_MUTATIONS_ENABLED',
      'false',
    );
    const enabled = ['1', 'true', 'yes', 'on'].includes(
      String(value).trim().toLowerCase(),
    );

    if (!enabled) {
      throw new ServiceUnavailableException(
        'Group V2 role mutations are not enabled',
      );
    }
  }

  private async loadGroup(conversationId: string): Promise<Conversation> {
    const conversation =
      await this.chatRepository.findConversation(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.isGroup) {
      throw new BadRequestException(
        'Group member roles are only supported for groups',
      );
    }

    return conversation;
  }

  private assertLegacyOwnerAndTarget(
    conversation: Conversation,
    actorUserId: string,
    targetUserId: string,
  ): void {
    if (conversation.creatorId !== actorUserId) {
      throw new ForbiddenException(
        'Only the current group owner can change member roles during migration',
      );
    }

    if (actorUserId === targetUserId) {
      throw new BadRequestException('The group owner role cannot be changed');
    }

    if (!conversation.participantIds.includes(targetUserId)) {
      throw new BadRequestException('Target user is not an active group member');
    }
  }

  private async loadProjection(
    conversationId: string,
  ): Promise<ConversationMemberRecord[]> {
    try {
      return await this.memberRepository.listByConversation(conversationId);
    } catch {
      throw new ServiceUnavailableException(
        'ConversationMember projection is temporarily unavailable',
      );
    }
  }

  private toDto(member: ConversationMemberRecord): GroupMemberProjectionDto {
    return {
      userId: member.userId,
      role: member.role,
      status: 'ACTIVE',
      joinedAt: member.joinedAt.toISOString(),
      ...(member.invitedBy !== undefined
        ? { invitedBy: member.invitedBy }
        : {}),
    };
  }
}
