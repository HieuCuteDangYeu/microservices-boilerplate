import type {
  ISemanticCandidateInspector,
  SemanticCandidateSnapshot,
} from '@indexing/domain/interfaces/semantic-candidate-inspector.interface';
import { PrismaService } from '@indexing/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class PrismaSemanticCandidateInspector
  implements ISemanticCandidateInspector
{
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(input: {
    reelId: string;
    indexAttemptId: string;
  }): Promise<SemanticCandidateSnapshot> {
    const [
      reelDocumentCount,
      sectionCount,
      chunkCount,
      visualSceneCount,
      transcriptSegmentCount,
      activeReels,
      activeSections,
      activeChunks,
      activeVisualScenes,
    ] = await Promise.all([
      this.prisma.reelDocument.count({ where: input }),
      this.prisma.reelSection.count({ where: input }),
      this.prisma.reelChunk.count({ where: input }),
      this.prisma.reelVisualScene.count({ where: input }),
      this.prisma.transcriptionSegment.count({ where: input }),
      this.prisma.reelDocument.count({ where: { ...input, isActive: true } }),
      this.prisma.reelSection.count({ where: { ...input, isActive: true } }),
      this.prisma.reelChunk.count({ where: { ...input, isActive: true } }),
      this.prisma.reelVisualScene.count({ where: { ...input, isActive: true } }),
    ]);

    return {
      reelDocumentCount,
      sectionCount,
      chunkCount,
      visualSceneCount,
      transcriptSegmentCount,
      activeDocumentCount:
        activeReels + activeSections + activeChunks + activeVisualScenes,
    };
  }
}
