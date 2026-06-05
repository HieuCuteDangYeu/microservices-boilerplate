import { ConversationMemoryContext } from '@common/ai/interfaces/conversation-memory.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IConversationMemoryRepository } from '../../domain/interfaces/conversation-memory.repository.interface';

@Injectable()
export class GetConversationMemoryUseCase {
  constructor(
    @Inject('IConversationMemoryRepository')
    private readonly conversationMemoryRepository: IConversationMemoryRepository,
  ) {}

  async execute(input: {
    conversationId: string;
  }): Promise<ConversationMemoryContext> {
    const memory = await this.conversationMemoryRepository.findByConversationId(
      input.conversationId,
    );

    return {
      conversationId: input.conversationId,
      summary: memory?.summary,
      messageCount: memory?.messageCount,
      updatedAt: memory?.updatedAt?.toISOString(),
    };
  }
}
