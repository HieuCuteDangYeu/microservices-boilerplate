export type ConversationMetadataPatch = {
  name?: string;
  picture?: string | null;
};

export abstract class IConversationMutationRepository {
  abstract updateMetadataAsOwner(
    conversationId: string,
    currentOwnerUserId: string,
    patch: ConversationMetadataPatch,
  ): Promise<boolean>;

  abstract addParticipantAsOwner(
    conversationId: string,
    currentOwnerUserId: string,
    userId: string,
    joinedAt: Date,
  ): Promise<boolean>;

  abstract transferOwnership(
    conversationId: string,
    currentOwnerUserId: string,
    newOwnerUserId: string,
  ): Promise<boolean>;

  abstract removeParticipantAsOwner(
    conversationId: string,
    currentOwnerUserId: string,
    userId: string,
  ): Promise<boolean>;

  abstract removeParticipantAsMember(
    conversationId: string,
    userId: string,
  ): Promise<boolean>;

  abstract removeParticipant(
    conversationId: string,
    userId: string,
  ): Promise<void>;
}
