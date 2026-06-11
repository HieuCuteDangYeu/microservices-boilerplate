import type { Reel } from '../entities/reel.entity';

export interface CreatedConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  media?: unknown;
  createdAt: string;
  createdAtMs?: number;
}

export interface IConversationMessageService {
  createReelMessage(input: {
    conversationId: string;
    senderId: string;
    reel: Reel;
  }): Promise<CreatedConversationMessage>;
}
