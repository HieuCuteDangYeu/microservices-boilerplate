import type {
  IRagHierarchyShadowObservationRepository,
  RagHierarchyShadowObservation,
} from '@ai/domain/interfaces/rag-hierarchy-shadow-observation.repository.interface';
import { PrismaService } from '@ai/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/ai-client';

@Injectable()
export class PrismaRagHierarchyShadowObservationRepository implements IRagHierarchyShadowObservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(observation: RagHierarchyShadowObservation): Promise<void> {
    await this.prisma.ragHierarchyShadowObservation.create({
      data: {
        userId: observation.userId,
        conversationId: observation.conversationId,
        queryText: observation.queryText,
        retrievalMode: observation.retrievalMode,
        requiredEvidence: observation.requiredEvidence,
        directChunkIds: this.toJsonStringArray(observation.directChunkIds),
        hierarchicalChunkIds: this.toJsonStringArray(
          observation.hierarchicalChunkIds,
        ),
        directCount: observation.directChunkIds.length,
        hierarchicalCount: observation.hierarchicalChunkIds.length,
        directMs: observation.directMs,
        hierarchicalMs: observation.hierarchicalMs,
        overlapAtK: observation.overlapAtK,
        jaccard: observation.jaccard,
      },
    });
  }

  private toJsonStringArray(value: string[]): Prisma.InputJsonValue {
    return value.map((item) => item);
  }
}
