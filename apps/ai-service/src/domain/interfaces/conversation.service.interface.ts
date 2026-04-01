import type { MessageDto } from '@common/conversation/dtos/message.dto';

export interface IConversationService {
  getRecentMessages(
    conversationId: string,
    userId: string,
    limit?: number,
  ): Promise<MessageDto[]>;
}
