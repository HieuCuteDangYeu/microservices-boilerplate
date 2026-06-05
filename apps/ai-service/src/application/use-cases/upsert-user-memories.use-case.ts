import type { ExtractedUserMemoryCandidate } from '@common/ai/interfaces/extract-user-memory.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IUserMemoryRepository } from '../../domain/interfaces/user-memory.repository.interface';

@Injectable()
export class UpsertUserMemoriesUseCase {
  constructor(
    @Inject('IUserMemoryRepository')
    private readonly userMemoryRepository: IUserMemoryRepository,
  ) {}

  async execute(input: {
    userId: string;
    conversationId: string;
    memories: ExtractedUserMemoryCandidate[];
  }) {
    const validMemories = input.memories
      .filter((memory) => memory.content.trim().length > 0)
      .filter((memory) => memory.confidence >= 0.65)
      .map((memory) => ({
        userId: input.userId,
        type: memory.type,
        content: memory.content.trim(),
        normalizedContent: this.normalize(memory.content),
        confidence: memory.confidence,
        sourceConversationId: input.conversationId,
      }));

    if (validMemories.length === 0) {
      return [];
    }

    return await this.userMemoryRepository.upsertMany(validMemories);
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}
