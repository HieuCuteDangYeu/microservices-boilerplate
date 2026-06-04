export interface PublishChatTokenInput {
  conversationId: string;
  userId: string;
  token: string;
}

export interface IChatTokenPublisher {
  publishToken(input: PublishChatTokenInput): void;
}
