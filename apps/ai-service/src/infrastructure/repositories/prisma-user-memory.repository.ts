import { Injectable } from '@nestjs/common';
import { UserMemory as PrismaUserMemory } from '@prisma/ai-client';
import { UserMemory } from '../../domain/entities/user-memory.entity';
import type {
  IUserMemoryRepository,
  UserMemoryUpsertInput,
} from '../../domain/interfaces/user-memory.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaUserMemoryRepository implements IUserMemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string, limit: number): Promise<UserMemory[]> {
    const memories = await this.prisma.userMemory.findMany({
      where: {
        userId,
        confidence: {
          gte: 0.5,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { confidence: 'desc' }],
      take: limit,
    });

    return memories.map((memory) => this.toDomain(memory));
  }

  async upsertMany(inputs: UserMemoryUpsertInput[]): Promise<UserMemory[]> {
    const results: UserMemory[] = [];

    for (const input of inputs) {
      const memory = await this.prisma.userMemory.upsert({
        where: {
          userId_type_normalizedContent: {
            userId: input.userId,
            type: input.type,
            normalizedContent: input.normalizedContent,
          },
        },
        create: {
          userId: input.userId,
          type: input.type,
          content: input.content,
          normalizedContent: input.normalizedContent,
          confidence: input.confidence,
          sourceConversationId: input.sourceConversationId,
        },
        update: {
          content: input.content,
          confidence: Math.max(input.confidence, 0.5),
          sourceConversationId: input.sourceConversationId,
          updatedAt: new Date(),
        },
      });

      results.push(this.toDomain(memory));
    }

    return results;
  }

  async markUsed(memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) {
      return;
    }

    await this.prisma.userMemory.updateMany({
      where: {
        id: {
          in: memoryIds,
        },
      },
      data: {
        lastUsedAt: new Date(),
      },
    });
  }

  private toDomain(memory: PrismaUserMemory): UserMemory {
    return new UserMemory({
      id: memory.id,
      userId: memory.userId,
      type: memory.type,
      content: memory.content,
      normalizedContent: memory.normalizedContent,
      confidence: memory.confidence,
      sourceConversationId: memory.sourceConversationId ?? undefined,
      lastUsedAt: memory.lastUsedAt ?? undefined,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    });
  }
}
