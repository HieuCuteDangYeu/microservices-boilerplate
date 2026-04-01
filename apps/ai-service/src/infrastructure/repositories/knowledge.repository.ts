import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Knowledge } from '../../domain/entities/knowledge.entity';
import type { IKnowledgeRepository } from '../../domain/interfaces/knowledge.repository.interface';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KnowledgeRepository implements IKnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(knowledge: Knowledge, vector: number[]): Promise<Knowledge> {
    const id = knowledge.id ?? randomUUID();

    await this.prisma.$executeRaw`
      INSERT INTO system_knowledge (id, topic, content, embedding, created_at, updated_at)
      VALUES (${id}, ${knowledge.topic}, ${knowledge.content}, ${vector}::vector, NOW(), NOW())
    `;

    return new Knowledge(id, knowledge.topic, knowledge.content);
  }

  async search(vector: number[], limit: number = 3): Promise<Knowledge[]> {
    const results = await this.prisma.$queryRaw<
      Array<{ id: string; topic: string; content: string }>
    >`
      SELECT id, topic, content
      FROM system_knowledge
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${limit};
    `;

    return results.map((row) => new Knowledge(row.id, row.topic, row.content));
  }
}
