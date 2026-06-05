import type { ConversationTurnCompletedPayload } from '@common/ai/interfaces/user-memory.interface';
import { Injectable, Logger } from '@nestjs/common';
import { ExtractUserMemoriesFromTurnUseCase } from './extract-user-memories-from-turn.use-case';
import { UpsertUserMemoriesUseCase } from './upsert-user-memories.use-case';

@Injectable()
export class HandleConversationTurnCompletedUseCase {
  private readonly logger = new Logger(
    HandleConversationTurnCompletedUseCase.name,
  );

  constructor(
    private readonly extractUserMemoriesFromTurnUseCase: ExtractUserMemoriesFromTurnUseCase,
    private readonly upsertUserMemoriesUseCase: UpsertUserMemoriesUseCase,
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

    const extracted = await this.extractUserMemoriesFromTurnUseCase.execute({
      userId: payload.userId,
      conversationId: payload.conversationId,
      userMessage: payload.userMessage,
      assistantMessage: payload.assistantMessage,
    });

    const saved = await this.upsertUserMemoriesUseCase.execute({
      userId: payload.userId,
      conversationId: payload.conversationId,
      memories: extracted.memories,
    });

    if (saved.length > 0) {
      this.logger.log(
        `[Memory] saved=${saved.length} userId=${payload.userId} conversationId=${payload.conversationId}`,
      );
    }
  }
}
