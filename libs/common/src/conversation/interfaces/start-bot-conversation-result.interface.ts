export interface StartBotConversationResult {
  conversation: {
    id: string;
    creatorId: string;
    participantIds: string[];
    isGroup: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  isNewConversation: boolean;
}
