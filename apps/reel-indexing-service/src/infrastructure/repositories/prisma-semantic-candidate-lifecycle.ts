import type {
  ISemanticCandidateLifecycle,
  SemanticCandidateActivation,
} from '@indexing/domain/interfaces/semantic-candidate-lifecycle.interface';
import { PrismaService } from '@indexing/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/reel-indexing-client';

@Injectable()
export class PrismaSemanticCandidateLifecycle
  implements ISemanticCandidateLifecycle
{
  constructor(private readonly prisma: PrismaService) {}

  async activateCandidate(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<SemanticCandidateActivation> {
    return await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.reelId}))`;

      const previous = await transaction.reelDocument.findFirst({
        where: {
          reelId: input.reelId,
          isActive: true,
          indexAttemptId: { not: input.indexAttemptId },
        },
        select: { indexAttemptId: true },
      });

      await this.setActive(transaction, input.reelId, undefined, false);
      const activated = await transaction.reelDocument.updateMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.indexAttemptId,
        },
        data: { isActive: true },
      });
      if (activated.count !== 1) {
        throw new Error(`Semantic candidate ${input.indexAttemptId} is missing`);
      }

      await transaction.reelSection.updateMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.indexAttemptId,
        },
        data: { isActive: true },
      });
      await transaction.reelChunk.updateMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.indexAttemptId,
        },
        data: { isActive: true },
      });
      await transaction.reelVisualScene.updateMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.indexAttemptId,
        },
        data: { isActive: true },
      });

      return {
        previousIndexAttemptId: previous?.indexAttemptId,
      };
    });
  }

  async rollbackCandidate(input: {
    reelId: string;
    indexAttemptId: string;
    previousIndexAttemptId?: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.reelId}))`;

      // A stale/failed attempt may finish its content RPC after a newer attempt
      // has already activated. Never let the older rollback deactivate the
      // newer winner. Compensation is valid only while this candidate is still
      // the active semantic candidate under the same per-reel lock.
      const stillActive = await transaction.reelDocument.count({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.indexAttemptId,
          isActive: true,
        },
      });
      if (stillActive !== 1) return;

      await this.setActive(transaction, input.reelId, undefined, false);

      if (!input.previousIndexAttemptId) return;

      const restored = await transaction.reelDocument.updateMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.previousIndexAttemptId,
        },
        data: { isActive: true },
      });
      if (restored.count !== 1) {
        throw new Error(
          `Previous semantic candidate ${input.previousIndexAttemptId} could not be restored`,
        );
      }

      await transaction.reelSection.updateMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.previousIndexAttemptId,
        },
        data: { isActive: true },
      });
      await transaction.reelChunk.updateMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.previousIndexAttemptId,
        },
        data: { isActive: true },
      });
      await transaction.reelVisualScene.updateMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.previousIndexAttemptId,
        },
        data: { isActive: true },
      });
    });
  }

  async finalizeCandidate(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.reelId}))`;

      const activeCandidate = await transaction.reelDocument.count({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.indexAttemptId,
          isActive: true,
        },
      });
      if (activeCandidate !== 1) {
        throw new Error(
          `Semantic candidate ${input.indexAttemptId} is not the active candidate`,
        );
      }

      await transaction.reelVisualScene.deleteMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: { not: input.indexAttemptId },
        },
      });
      await transaction.reelChunk.deleteMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: { not: input.indexAttemptId },
        },
      });
      await transaction.reelSection.deleteMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: { not: input.indexAttemptId },
        },
      });
      await transaction.reelDocument.deleteMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: { not: input.indexAttemptId },
        },
      });
      await transaction.transcriptionSegment.deleteMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: { not: input.indexAttemptId },
        },
      });

      const completed = await transaction.indexingAttempt.updateMany({
        where: {
          reelId: input.reelId,
          indexAttemptId: input.indexAttemptId,
        },
        data: { status: 'COMPLETED', lastError: null },
      });
      if (completed.count !== 1) {
        throw new Error(`Indexing attempt ${input.indexAttemptId} is missing`);
      }
    });
  }

  async discardCandidate(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.reelId}))`;
      const active = await transaction.reelDocument.count({
        where: { ...input, isActive: true },
      });
      if (active > 0) {
        return;
      }

      await transaction.reelVisualScene.deleteMany({ where: input });
      await transaction.reelChunk.deleteMany({ where: input });
      await transaction.reelSection.deleteMany({ where: input });
      await transaction.reelDocument.deleteMany({ where: input });
      await transaction.transcriptionSegment.deleteMany({ where: input });
    });
  }

  private async setActive(
    transaction: Prisma.TransactionClient,
    reelId: string,
    indexAttemptId: string | undefined,
    isActive: boolean,
  ): Promise<void> {
    const where = indexAttemptId ? { reelId, indexAttemptId } : { reelId };
    await transaction.reelVisualScene.updateMany({ where, data: { isActive } });
    await transaction.reelChunk.updateMany({ where, data: { isActive } });
    await transaction.reelSection.updateMany({ where, data: { isActive } });
    await transaction.reelDocument.updateMany({ where, data: { isActive } });
  }
}
