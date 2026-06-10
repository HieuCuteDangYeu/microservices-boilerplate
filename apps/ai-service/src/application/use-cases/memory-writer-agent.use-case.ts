import { ExtractUserMemoriesFromTurnUseCase } from '@ai/application/use-cases/extract-user-memories-from-turn.use-case';
import { UpdateConversationMemoryUseCase } from '@ai/application/use-cases/update-conversation-memory.use-case';
import { UpsertUserMemoriesUseCase } from '@ai/application/use-cases/upsert-user-memories.use-case';
import type { ConversationTurnCompletedPayload } from '@common/ai/interfaces/user-memory.interface';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MemoryWriterAgentUseCase {
  private readonly logger = new Logger(MemoryWriterAgentUseCase.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly updateConversationMemoryUseCase: UpdateConversationMemoryUseCase,
    private readonly extractUserMemoriesFromTurnUseCase: ExtractUserMemoriesFromTurnUseCase,
    private readonly upsertUserMemoriesUseCase: UpsertUserMemoriesUseCase,
  ) {}

  async execute(payload: ConversationTurnCompletedPayload): Promise<void> {
    const conversationMemoryEnabled = this.getBoolean(
      'AI_CONVERSATION_MEMORY_ENABLED',
      true,
    );

    const userMemoryExtractionEnabled = this.getBoolean(
      'AI_USER_MEMORY_EXTRACTION_ENABLED',
      true,
    );

    let messageCount = 0;

    if (conversationMemoryEnabled) {
      const result = await this.safeUpdateConversationMemory(payload);
      messageCount = result.messageCount;
    }

    if (
      userMemoryExtractionEnabled &&
      this.shouldExtractUserMemory(messageCount)
    ) {
      await this.safeExtractUserMemories(payload);
    }
  }

  private async safeUpdateConversationMemory(
    payload: ConversationTurnCompletedPayload,
  ): Promise<{ messageCount: number; summaryUpdated: boolean }> {
    try {
      return await this.updateConversationMemoryUseCase.execute(payload);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `[MemoryWriterAgent] conversation summary skipped conversationId=${payload.conversationId}: ${message}`,
      );

      return {
        messageCount: 0,
        summaryUpdated: false,
      };
    }
  }

  private async safeExtractUserMemories(
    payload: ConversationTurnCompletedPayload,
  ): Promise<void> {
    try {
      const extracted = await this.extractUserMemoriesFromTurnUseCase.execute({
        userId: payload.userId,
        conversationId: payload.conversationId,
        userMessage: payload.userMessage,
        assistantMessage: payload.assistantMessage,
        memory: payload.memory,
      });

      const saved = await this.upsertUserMemoriesUseCase.execute({
        userId: payload.userId,
        conversationId: payload.conversationId,
        userMessage: extracted.sourceText,
        memories: extracted.memories,
      });

      this.logger.debug(
        `[MemoryWriterAgent] extracted=${extracted.memories.length} saved=${saved.length}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `[MemoryWriterAgent] user memory skipped userId=${payload.userId} conversationId=${payload.conversationId}: ${message}`,
      );
    }
  }

  private shouldExtractUserMemory(messageCount: number): boolean {
    if (messageCount <= 0) {
      return false;
    }

    const everyNTurns = this.getPositiveNumber(
      'AI_USER_MEMORY_EVERY_N_TURNS',
      6,
    );

    const turnCount = Math.floor(messageCount / 2);

    return turnCount > 0 && turnCount % everyNTurns === 0;
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string>(key);

    if (value === undefined) {
      return fallback;
    }

    return value.toLowerCase() === 'true';
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
