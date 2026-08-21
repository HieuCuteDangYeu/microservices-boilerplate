import { Injectable } from '@nestjs/common';

import type { Conversation } from '../../domain/entities/conversation.entity';
import type { Message } from '../../domain/entities/message.entity';
import { IConversationRealtimePublisher } from '../../domain/interfaces/conversation-realtime-publisher.interface';
import { ChatGateway } from '../gateways/chat.gateway';
import { ChatMapper } from '../repositories/chat.mapper';

@Injectable()
export class ConversationRealtimePublisherAdapter implements IConversationRealtimePublisher {
  constructor(private readonly chatGateway: ChatGateway) {}

  emitNewMessage(conversationId: string, message: Message): void {
    this.chatGateway.emitToConversation(
      conversationId,
      'new_message',
      ChatMapper.toDto(message),
    );
  }

  emitConversationUpdated(
    conversation: Conversation,
    userIds?: string[],
  ): void {
    this.chatGateway.emitConversationUpdated(conversation, userIds);
  }
}
