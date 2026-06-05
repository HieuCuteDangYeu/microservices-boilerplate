import { Injectable } from '@nestjs/common';
import type { ConversationMemory as PrismaConversationMemory } from '@prisma/ai-client';
import { ConversationMemory } from '../../domain/entities/conversation-memory.entity';
import type {
  ConversationMemoryUpsertInput,
  IConversationMemoryRepository,
} from '../../domain/interfaces/conversation-memory.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaConversationMemoryRepository implements IConversationMemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByConversationId(
    conversationId: string,
  ): Promise<ConversationMemory | null> {
    const memory = await this.prisma.conversationMemory.findUnique({
      where: {
        conversationId,
      },
    });

    return memory ? this.toDomain(memory) : null;
  }

  async upsert(
    input: ConversationMemoryUpsertInput,
  ): Promise<ConversationMemory> {
    const memory = await this.prisma.conversationMemory.upsert({
      where: {
        conversationId: input.conversationId,
      },
      create: {
        conversationId: input.conversationId,
        userId: input.userId,
        summary: input.summary,
        messageCount: input.messageCount,
        lastMessageAt: input.lastMessageAt,
      },
      update: {
        userId: input.userId,
        summary: input.summary,
        messageCount: input.messageCount,
        lastMessageAt: input.lastMessageAt,
      },
    });

    return this.toDomain(memory);
  }

  private toDomain(memory: PrismaConversationMemory): ConversationMemory {
    return new ConversationMemory({
      id: memory.id,
      conversationId: memory.conversationId,
      userId: memory.userId,
      summary: memory.summary,
      messageCount: memory.messageCount,
      lastMessageAt: memory.lastMessageAt ?? undefined,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    });
  }
}
