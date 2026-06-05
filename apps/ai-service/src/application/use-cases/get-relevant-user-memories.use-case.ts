import type { RelevantUserMemoriesContext } from '@common/ai/interfaces/user-memory.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IUserMemoryRepository } from '../../domain/interfaces/user-memory.repository.interface';

@Injectable()
export class GetRelevantUserMemoriesUseCase {
  private readonly defaultLimit = 12;

  constructor(
    @Inject('IUserMemoryRepository')
    private readonly userMemoryRepository: IUserMemoryRepository,
  ) {}

  async execute(input: {
    userId: string;
    queryText: string;
    limit?: number;
  }): Promise<RelevantUserMemoriesContext> {
    const memories = await this.userMemoryRepository.findByUserId(
      input.userId,
      input.limit ?? this.defaultLimit,
    );

    await this.userMemoryRepository.markUsed(
      memories
        .map((memory) => memory.id)
        .filter((id): id is string => Boolean(id)),
    );

    return {
      memories: memories.map((memory) => ({
        id: memory.id,
        userId: memory.userId,
        type: memory.type,
        content: memory.content,
        confidence: memory.confidence,
        sourceConversationId: memory.sourceConversationId,
        createdAt: memory.createdAt?.toISOString(),
        updatedAt: memory.updatedAt?.toISOString(),
      })),
    };
  }
}
