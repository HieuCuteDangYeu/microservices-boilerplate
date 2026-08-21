export type ConversationMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type ConversationMemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';

export type ConversationMemberRecord = {
  id: string;
  conversationId: string;
  userId: string;
  role: ConversationMemberRole;
  status: ConversationMemberStatus;
  joinedAt: Date;
  invitedBy?: string | null;
  leftAt?: Date | null;
  removedBy?: string | null;
};

export interface IConversationMemberRepository {
  listByConversation(conversationId: string): Promise<ConversationMemberRecord[]>;
  changeRoleAsLegacyOwner(
    conversationId: string,
    actorUserId: string,
    targetUserId: string,
    expectedRole: 'ADMIN' | 'MEMBER',
    nextRole: 'ADMIN' | 'MEMBER',
  ): Promise<boolean>;
}
