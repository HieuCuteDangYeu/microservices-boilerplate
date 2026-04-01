import type { MessageDto } from '@common/conversation/dtos/message.dto';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import type { IConversationService } from '../../domain/interfaces/conversation.service.interface';

interface PaginatedMessageResponse {
  messages: MessageDto[];
  [key: string]: unknown;
}

@Injectable()
export class ConversationServiceAdapter implements IConversationService {
  constructor(
    @Inject('CONVERSATION_SERVICE')
    private readonly conversationClient: ClientProxy,
  ) {}

  async getRecentMessages(
    conversationId: string,
    userId: string,
    limit: number = 5,
  ): Promise<MessageDto[]> {
    const response = await lastValueFrom(
      this.conversationClient.send<MessageDto[] | PaginatedMessageResponse>(
        'get_messages',
        { conversationId, userId, limit },
      ),
    ).catch((): MessageDto[] => []);

    if (response && !Array.isArray(response) && 'messages' in response) {
      return response.messages;
    }

    if (Array.isArray(response)) {
      return response;
    }

    return [];
  }
}
