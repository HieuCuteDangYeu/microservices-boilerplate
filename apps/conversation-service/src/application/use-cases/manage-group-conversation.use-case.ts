import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Conversation } from '../../domain/entities/conversation.entity';

export type AddGroupMemberResult = {
  conversation: Conversation;
  added: boolean;
};
import { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import { IConversationMutationRepository } from '../../domain/interfaces/conversation-mutation.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import {
  assertValidConversationUserId,
  normalizeGroupName,
  normalizeGroupPicture,
} from '../policies/conversation-rules';

@Injectable()
export class ManageGroupConversationUseCase {
  constructor(
    @Inject('IChatRepository')
    private readonly chatRepository: IChatRepository,
    @Inject('IConversationMutationRepository')
    private readonly mutationRepository: IConversationMutationRepository,
    @Inject('IUserService')
    private readonly userService: IUserService,
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
    this.assertOwner(conversation, input.actorUserId);

    if (input.name === undefined && input.picture === undefined) {
      throw new BadRequestException(
        'At least one group field must be provided',
      );
    }

    const name = normalizeGroupName(input.name);
    const picture = normalizeGroupPicture(input.picture);

    await this.mutationRepository.updateMetadata(input.conversationId, {
      ...(name !== undefined ? { name } : {}),
      ...(picture !== undefined ? { picture } : {}),
    });

    return await this.getUpdatedConversation(input.conversationId);
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
    this.assertOwner(conversation, input.actorUserId);

    const userId = input.userId.trim();
    assertValidConversationUserId(userId);

    if (conversation.participantIds.includes(userId)) {
      return { conversation, added: false };
    }

    const isValidUser = await this.userService.validateUsers([userId]);
    if (!isValidUser) {
      throw new BadRequestException('Participant does not exist');
    }

    await this.mutationRepository.addParticipant(
      input.conversationId,
      userId,
      new Date(),
    );

    return {
      conversation: await this.getUpdatedConversation(input.conversationId),
      added: true,
    };
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
    this.assertOwner(conversation, input.actorUserId);

    const newOwnerUserId = input.userId.trim();
    assertValidConversationUserId(newOwnerUserId);

    if (newOwnerUserId === conversation.creatorId) {
      throw new BadRequestException('New owner must be another group member');
    }

    if (!conversation.participantIds.includes(newOwnerUserId)) {
      throw new NotFoundException('New owner must be an existing group member');
    }

    const transferred = await this.mutationRepository.transferOwnership(
      input.conversationId,
      input.actorUserId,
      newOwnerUserId,
    );

    if (!transferred) {
      throw new ConflictException(
        'Group membership or ownership changed; refresh and try again',
      );
    }

    return await this.getUpdatedConversation(input.conversationId);
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
    this.assertOwner(conversation, input.actorUserId);

    const userId = input.userId.trim();
    assertValidConversationUserId(userId);

    if (userId === conversation.creatorId) {
      throw new BadRequestException('The group owner cannot be removed');
    }

    if (!conversation.participantIds.includes(userId)) {
      throw new NotFoundException('Conversation member not found');
    }

    this.assertGroupWillKeepMinimumMembers(conversation);

    const removed = await this.mutationRepository.removeParticipantAsOwner(
      input.conversationId,
      input.actorUserId,
      userId,
    );

    if (!removed) {
      throw new ConflictException(
        'Group membership or ownership changed; refresh and try again',
      );
    }

    return await this.getUpdatedConversation(input.conversationId);
  }

  async leave(input: {
    conversationId: string;
    actorUserId: string;
  }): Promise<Conversation> {
    const conversation = await this.getGroupConversationForMember(
      input.conversationId,
      input.actorUserId,
    );

    if (conversation.creatorId === input.actorUserId) {
      throw new BadRequestException(
        'The group owner must transfer ownership before leaving',
      );
    }

    this.assertGroupWillKeepMinimumMembers(conversation);

    const removed = await this.mutationRepository.removeParticipantAsMember(
      input.conversationId,
      input.actorUserId,
    );

    if (!removed) {
      throw new ConflictException(
        'Group membership or ownership changed; refresh and try again',
      );
    }

    return await this.getUpdatedConversation(input.conversationId);
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
}
