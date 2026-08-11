import type {
  RagChatWorkflowState,
  RagCitation,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BuildRagCitationsUseCase {
  execute(state: RagChatWorkflowState): RagCitation[] {
    if (state.route?.intent !== 'REEL_VIDEO_QUESTION') {
      return [];
    }

    if (state.contextSufficiency?.sufficient === false) {
      return [];
    }

    const seen = new Set<string>();
    const citations: RagCitation[] = [];

    for (const chunk of state.rerankedChunks) {
      const key = `${chunk.reelId}:${chunk.chunkId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const evidence = chunk.evidenceText?.trim() || chunk.chunkText.trim();
      if (!evidence) continue;

      citations.push({
        sourceType: 'REEL',
        reelId: chunk.reelId,
        evidenceType: chunk.evidenceType ?? 'TRANSCRIPT',
        title: chunk.title ?? undefined,
        startTime: this.toOptionalNumber(chunk.startTime),
        endTime: this.toOptionalNumber(chunk.endTime),
        quote: this.exactQuote(evidence, 240),
      });

      if (citations.length >= 3) break;
    }

    return citations;
  }

  private toOptionalNumber(
    value: number | null | undefined,
  ): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return undefined;
    }

    return value;
  }

  private exactQuote(value: string, maxLength: number): string {
    const clean = value.replace(/\s+/g, ' ').trim();

    if (clean.length <= maxLength) {
      return clean;
    }

    const boundary = clean.lastIndexOf(' ', maxLength);
    return clean.slice(0, boundary > 0 ? boundary : maxLength).trim();
  }
}
