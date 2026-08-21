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

import { Conversation } from '../../domain/entities/conversation.entity';
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import type {
  ConversationMemberRecord,
  ConversationMemberRole,
  IConversationMemberRepository,
} from '../../domain/interfaces/conversation-member.repository.interface';
import { IConversationMutationRepository } from '../../domain/interfaces/conversation-mutation.repository.interface';
import { IGroupManagementV2Repository } from '../../domain/interfaces/group-management-v2.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import {
  evaluateGroupPermission,
  type GroupPermission,
} from '../policies/group-permission.policy';
import {
  assertValidConversationUserId,
  normalizeGroupName,
  normalizeGroupPicture,
} from '../policies/conversation-rules';
import { GroupActivityService } from '../services/group-activity.service';
import { GroupMembershipConsistencyService } from '../services/group-membership-consistency.service';

export type AddGroupMemberResult = {
  conversation: Conversation;
  added: boolean;
};

@Injectable()
export class ManageGroupConversationUseCase {
  constructor(
    @Inject('IChatRepository')
    private readonly chatRepository: IChatRepository,
    @Inject('IConversationMutationRepository')
    private readonly mutationRepository: IConversationMutationRepository,
    @Inject('IConversationMemberRepository')
    private readonly memberRepository: IConversationMemberRepository,
    @Inject('IGroupManagementV2Repository')
    private readonly groupManagementV2Repository: IGroupManagementV2Repository,
    @Inject('IUserService')
    private readonly userService: IUserService,
    private readonly configService: ConfigService,
    private readonly consistencyService: GroupMembershipConsistencyService,
    private readonly groupActivityService: GroupActivityService,
  ) {}

  async updateMetadata(input: {
    conversationId: string;
    actorUserId: string;
    name?: string;
    picture?: string | null;
  }): Promise<Conversation> {
    const conversation = await this.getGroupConversationForMember(
      input.conversationId,
      input.actorUserId,
    );

    if (input.name === undefined && input.picture === undefined) {
      throw new BadRequestException(
        'At least one group field must be provided',
      );
    }

    const name = normalizeGroupName(input.name);
    const picture = normalizeGroupPicture(input.picture);
    const nameChanged = name !== undefined && name !== conversation.name;
    const pictureChanged =
      picture !== undefined && picture !== conversation.picture;

    if (!nameChanged && !pictureChanged) {
      return conversation;
    }

    const patch = {
      ...(name !== undefined ? { name } : {}),
      ...(picture !== undefined ? { picture } : {}),
    };
    let updated = false;

    if (!this.isAdminPermissionsEnabled()) {
      this.assertOwner(conversation, input.actorUserId);
      updated = await this.mutationRepository.updateMetadataAsOwner(
        input.conversationId,
        input.actorUserId,
        patch,
      );
    } else {
      const members = await this.loadConsistentProjection(conversation);
      const actor = this.requireActiveMember(members, input.actorUserId);
      this.assertPermission(actor.role, 'UPDATE_METADATA');
      updated =
        await this.groupManagementV2Repository.updateMetadataWithRoleGuard(
          input.conversationId,
          input.actorUserId,
          actor.role,
          patch,
        );
    }

    if (!updated) {
      throw this.conflict();
    }

    const updatedConversation = await this.getUpdatedConversation(
      input.conversationId,
    );
    const actorName = this.displayName(conversation, input.actorUserId);

    if (nameChanged) {
      this.groupActivityService.publish({
        conversationId: input.conversationId,
        type: 'GROUP_RENAMED',
        actorUserId: input.actorUserId,
        actorName,
        previousValue: conversation.name ?? null,
        nextValue: name ?? null,
      });
    }

    if (pictureChanged) {
      this.groupActivityService.publish({
        conversationId: input.conversationId,
        type: 'GROUP_PICTURE_CHANGED',
        actorUserId: input.actorUserId,
        actorName,
        previousValue: conversation.picture ?? null,
        nextValue: picture ?? null,
      });
    }

    return updatedConversation;
  }

  async addMember(input: {
    conversationId: string;
    actorUserId: string;
    userId: string;
  }): Promise<AddGroupMemberResult> {
    const conversation = await this.getGroupConversationForMember(
      input.conversationId,
      input.actorUserId,
    );
    const userId = input.userId.trim();
    assertValidConversationUserId(userId);

    let actorRole: ConversationMemberRole | null = null;
    if (!this.isAdminPermissionsEnabled()) {
      this.assertOwner(conversation, input.actorUserId);
    } else {
      const members = await this.loadConsistentProjection(conversation);
      const actor = this.requireActiveMember(members, input.actorUserId);
      actorRole = actor.role;
      this.assertPermission(actor.role, 'ADD_MEMBER');
    }

    if (conversation.participantIds.includes(userId)) {
      return { conversation, added: false };
    }

    await this.assertUserExists(userId);
    const joinedAt = new Date();
    const added = actorRole
      ? await this.groupManagementV2Repository.addParticipantWithRoleGuard(
          input.conversationId,
          input.actorUserId,
          actorRole,
          userId,
          joinedAt,
        )
      : await this.mutationRepository.addParticipantAsOwner(
          input.conversationId,
          input.actorUserId,
          userId,
          joinedAt,
        );

    if (!added) {
      const currentConversation = await this.getUpdatedConversation(
        input.conversationId,
      );

      if (
        !actorRole &&
        currentConversation.creatorId === input.actorUserId &&
        currentConversation.participantIds.includes(userId)
      ) {
        this.scheduleConsistencyCheck(input.conversationId, 'add-member');
        return { conversation: currentConversation, added: false };
      }

      throw this.conflict();
    }

    const updatedConversation = await this.getUpdatedConversation(
      input.conversationId,
    );
    this.scheduleConsistencyCheck(input.conversationId, 'add-member');
    this.groupActivityService.publish({
      conversationId: input.conversationId,
      type: 'MEMBER_ADDED',
      actorUserId: input.actorUserId,
      actorName: this.displayName(conversation, input.actorUserId),
      targetUserId: userId,
      targetName: this.displayName(updatedConversation, userId),
    });

    return { conversation: updatedConversation, added: true };
  }

  async transferOwnership(input: {
    conversationId: string;
    actorUserId: string;
    userId: string;
  }): Promise<Conversation> {
    const conversation = await this.getGroupConversationForMember(
      input.conversationId,
      input.actorUserId,
    );
    const newOwnerUserId = input.userId.trim();
    assertValidConversationUserId(newOwnerUserId);

    if (newOwnerUserId === conversation.creatorId) {
      throw new BadRequestException('New owner must be another group member');
    }

    if (!conversation.participantIds.includes(newOwnerUserId)) {
      throw new NotFoundException('New owner must be an existing group member');
    }

    let transferred = false;
    if (!this.isAdminPermissionsEnabled()) {
      this.assertOwner(conversation, input.actorUserId);
      transferred = await this.mutationRepository.transferOwnership(
        input.conversationId,
        input.actorUserId,
        newOwnerUserId,
      );
    } else {
      const members = await this.loadConsistentProjection(conversation);
      const actor = this.requireActiveMember(members, input.actorUserId);
      const target = this.requireActiveMember(members, newOwnerUserId);
      this.assertPermission(actor.role, 'TRANSFER_OWNERSHIP', target.role);

      if (target.role === 'OWNER') {
        throw new BadRequestException(
          'Ownership must transfer to another member',
        );
      }

      transferred =
        await this.groupManagementV2Repository.transferOwnershipWithRoleGuard(
          input.conversationId,
          input.actorUserId,
          newOwnerUserId,
          target.role,
        );
    }

    if (!transferred) {
      throw this.conflict();
    }

    const updatedConversation = await this.getUpdatedConversation(
      input.conversationId,
    );
    this.scheduleConsistencyCheck(input.conversationId, 'transfer-ownership');
    this.groupActivityService.publish({
      conversationId: input.conversationId,
      type: 'OWNERSHIP_TRANSFERRED',
      actorUserId: input.actorUserId,
      actorName: this.displayName(conversation, input.actorUserId),
      targetUserId: newOwnerUserId,
      targetName: this.displayName(conversation, newOwnerUserId),
    });
    return updatedConversation;
  }

  async removeMember(input: {
    conversationId: string;
    actorUserId: string;
    userId: string;
  }): Promise<Conversation> {
    const conversation = await this.getGroupConversationForMember(
      input.conversationId,
      input.actorUserId,
    );
    const userId = input.userId.trim();
    assertValidConversationUserId(userId);

    if (!conversation.participantIds.includes(userId)) {
      throw new NotFoundException('Conversation member not found');
    }

    this.assertGroupWillKeepMinimumMembers(conversation);
    let removed = false;

    if (!this.isAdminPermissionsEnabled()) {
      this.assertOwner(conversation, input.actorUserId);
      if (userId === conversation.creatorId) {
        throw new BadRequestException('The group owner cannot be removed');
      }
      removed = await this.mutationRepository.removeParticipantAsOwner(
        input.conversationId,
        input.actorUserId,
        userId,
      );
    } else {
      const members = await this.loadConsistentProjection(conversation);
      const actor = this.requireActiveMember(members, input.actorUserId);
      const target = this.requireActiveMember(members, userId);
      this.assertPermission(actor.role, 'REMOVE_MEMBER', target.role);
      removed =
        await this.groupManagementV2Repository.removeParticipantWithRoleGuard(
          input.conversationId,
          input.actorUserId,
          actor.role,
          userId,
          target.role,
          new Date(),
        );
    }

    if (!removed) {
      throw this.conflict();
    }

    const updatedConversation = await this.getUpdatedConversation(
      input.conversationId,
    );
    this.scheduleConsistencyCheck(input.conversationId, 'remove-member');
    this.groupActivityService.publish({
      conversationId: input.conversationId,
      type: 'MEMBER_REMOVED',
      actorUserId: input.actorUserId,
      actorName: this.displayName(conversation, input.actorUserId),
      targetUserId: userId,
      targetName: this.displayName(conversation, userId),
    });
    return updatedConversation;
  }

  async leave(input: {
    conversationId: string;
    actorUserId: string;
  }): Promise<Conversation> {
    const conversation = await this.getGroupConversationForMember(
      input.conversationId,
      input.actorUserId,
    );
    this.assertGroupWillKeepMinimumMembers(conversation);
    let removed = false;

    if (!this.isAdminPermissionsEnabled()) {
      if (conversation.creatorId === input.actorUserId) {
        throw new BadRequestException(
          'The group owner must transfer ownership before leaving',
        );
      }
      removed = await this.mutationRepository.removeParticipantAsMember(
        input.conversationId,
        input.actorUserId,
      );
    } else {
      const members = await this.loadConsistentProjection(conversation);
      const actor = this.requireActiveMember(members, input.actorUserId);
      this.assertPermission(actor.role, 'LEAVE_GROUP');
      removed =
        await this.groupManagementV2Repository.leaveParticipantWithRoleGuard(
          input.conversationId,
          input.actorUserId,
          actor.role,
          new Date(),
        );
    }

    if (!removed) {
      throw this.conflict();
    }

    const updatedConversation = await this.getUpdatedConversation(
      input.conversationId,
    );
    this.scheduleConsistencyCheck(input.conversationId, 'leave-group');
    this.groupActivityService.publish({
      conversationId: input.conversationId,
      type: 'MEMBER_LEFT',
      actorUserId: input.actorUserId,
      actorName: this.displayName(conversation, input.actorUserId),
    });
    return updatedConversation;
  }

  private isAdminPermissionsEnabled(): boolean {
    const value = this.configService.get<string>(
      'GROUP_V2_ADMIN_PERMISSIONS_ENABLED',
      'false',
    );
    return ['1', 'true', 'yes', 'on'].includes(
      String(value).trim().toLowerCase(),
    );
  }

  private async getGroupConversationForMember(
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation =
      await this.chatRepository.findConversation(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.participantIds.includes(userId)) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    if (!conversation.isGroup) {
      throw new BadRequestException(
        'Conversation member management is only supported for groups',
      );
    }

    return conversation;
  }

  private async loadConsistentProjection(
    conversation: Conversation,
  ): Promise<ConversationMemberRecord[]> {
    let members: ConversationMemberRecord[];
    try {
      members = await this.memberRepository.listByConversation(conversation.id);
    } catch {
      throw new ServiceUnavailableException(
        'ConversationMember projection is temporarily unavailable',
      );
    }

    const activeMembers = members.filter(
      (member) => member.status === 'ACTIVE',
    );
    const legacyIds = [...new Set(conversation.participantIds)].sort();
    const projectedIds = activeMembers.map((member) => member.userId).sort();
    const hasMemberSetDrift =
      legacyIds.length !== projectedIds.length ||
      legacyIds.some((userId, index) => userId !== projectedIds[index]);
    const owners = activeMembers.filter((member) => member.role === 'OWNER');
    const hasOwnerDrift =
      owners.length !== 1 || owners[0]?.userId !== conversation.creatorId;
    const hasJoinedAtDrift = activeMembers.some((member) => {
      const expectedJoinedAt =
        conversation.memberJoinedAt?.[member.userId] ??
        conversation.createdAt.toISOString();
      const expectedMs = Date.parse(expectedJoinedAt);
      return (
        !Number.isFinite(expectedMs) || member.joinedAt.getTime() !== expectedMs
      );
    });

    if (hasMemberSetDrift || hasOwnerDrift || hasJoinedAtDrift) {
      throw new ConflictException(
        'ConversationMember projection is not consistent enough for V2 permissions',
      );
    }

    return activeMembers;
  }

  private requireActiveMember(
    members: ConversationMemberRecord[],
    userId: string,
  ): ConversationMemberRecord {
    const member = members.find((candidate) => candidate.userId === userId);
    if (!member) {
      throw new ForbiddenException('Active group membership is required');
    }
    return member;
  }

  private assertPermission(
    actorRole: ConversationMemberRole,
    permission: GroupPermission,
    targetRole?: ConversationMemberRole,
  ): void {
    const decision = evaluateGroupPermission({
      actorRole,
      permission,
      ...(targetRole ? { targetRole } : {}),
    });

    if (!decision.allowed) {
      throw new ForbiddenException(
        decision.reason ?? 'Group action is not allowed',
      );
    }
  }

  private assertOwner(conversation: Conversation, userId: string): void {
    if (conversation.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the group owner can manage this group',
      );
    }
  }

  private assertGroupWillKeepMinimumMembers(conversation: Conversation): void {
    if (conversation.participantIds.length <= 2) {
      throw new BadRequestException(
        'A group must keep at least 2 participants',
      );
    }
  }

  private async assertUserExists(userId: string): Promise<void> {
    const isValidUser = await this.userService.validateUsers([userId]);
    if (!isValidUser) {
      throw new BadRequestException('Participant does not exist');
    }
  }

  private displayName(conversation: Conversation, userId: string): string {
    const participant = conversation.participants?.find(
      (candidate) => candidate.id === userId,
    );
    return (
      participant?.name?.trim() ||
      participant?.fullName?.trim() ||
      participant?.email?.split('@')[0] ||
      'A member'
    );
  }

  private async getUpdatedConversation(
    conversationId: string,
  ): Promise<Conversation> {
    const conversation =
      await this.chatRepository.findConversation(conversationId);

    if (!conversation) {
      throw new NotFoundException('Conversation not found after update');
    }

    return conversation;
  }

  private conflict(): ConflictException {
    return new ConflictException(
      'Group membership, ownership, or role changed; refresh and try again',
    );
  }

  private scheduleConsistencyCheck(
    conversationId: string,
    trigger:
      | 'add-member'
      | 'remove-member'
      | 'leave-group'
      | 'transfer-ownership',
  ): void {
    void this.consistencyService
      .checkAfterMutation(conversationId, trigger)
      .catch(() => undefined);
  }
}
