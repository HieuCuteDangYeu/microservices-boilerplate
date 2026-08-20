import type { ConversationMemberRole } from './conversation-member.repository.interface';
import type { ConversationMetadataPatch } from './conversation-mutation.repository.interface';

export abstract class IGroupManagementV2Repository {
  abstract updateMetadataWithRoleGuard(
    conversationId: string,
    actorUserId: string,
    expectedActorRole: ConversationMemberRole,
    patch: ConversationMetadataPatch,
  ): Promise<boolean>;

  abstract addParticipantWithRoleGuard(
    conversationId: string,
    actorUserId: string,
    expectedActorRole: ConversationMemberRole,
    userId: string,
    joinedAt: Date,
  ): Promise<boolean>;

  abstract removeParticipantWithRoleGuard(
    conversationId: string,
    actorUserId: string,
    expectedActorRole: ConversationMemberRole,
    userId: string,
    expectedTargetRole: ConversationMemberRole,
    removedAt: Date,
  ): Promise<boolean>;

  abstract leaveParticipantWithRoleGuard(
    conversationId: string,
    userId: string,
    expectedActorRole: ConversationMemberRole,
    leftAt: Date,
  ): Promise<boolean>;

  abstract transferOwnershipWithRoleGuard(
    conversationId: string,
    actorUserId: string,
    newOwnerUserId: string,
    expectedTargetRole: Exclude<ConversationMemberRole, 'OWNER'>,
  ): Promise<boolean>;
}
