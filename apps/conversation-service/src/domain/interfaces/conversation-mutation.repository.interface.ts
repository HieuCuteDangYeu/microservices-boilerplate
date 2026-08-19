export type ConversationMetadataPatch = {
  name?: string;
  picture?: string | null;
};

export abstract class IConversationMutationRepository {
  abstract updateMetadata(
    conversationId: string,
    patch: ConversationMetadataPatch,
  ): Promise<void>;

  abstract addParticipant(
    conversationId: string,
    userId: string,
    joinedAt: Date,
  ): Promise<void>;

  abstract transferOwnership(
    conversationId: string,
    currentOwnerUserId: string,
    newOwnerUserId: string,
  ): Promise<boolean>;

  abstract removeParticipant(
    conversationId: string,
    userId: string,
  ): Promise<void>;
}
