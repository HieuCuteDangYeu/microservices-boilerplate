import { MemoryWriterAgentUseCase } from '@ai/application/use-cases/memory-writer-agent.use-case';
import type { ConversationTurnCompletedPayload } from '@common/ai/interfaces/user-memory.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HandleConversationTurnCompletedUseCase {
  constructor(
    private readonly memoryWriterAgentUseCase: MemoryWriterAgentUseCase,
  ) {}

  async execute(payload: ConversationTurnCompletedPayload): Promise<void> {
    if (
      !payload.userId ||
      !payload.conversationId ||
      !payload.userMessage?.trim() ||
      !payload.assistantMessage?.trim()
    ) {
      return;
    }

    await this.memoryWriterAgentUseCase.execute(payload);
  }
}
