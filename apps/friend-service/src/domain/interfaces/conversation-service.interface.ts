export interface IConversationService {
  createDirectConversation(userId: string, otherUserId: string): Promise<string>;
}
