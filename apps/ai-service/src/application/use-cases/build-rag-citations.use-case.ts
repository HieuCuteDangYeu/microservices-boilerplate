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

    return state.rerankedChunks.slice(0, 3).map((chunk) => ({
      sourceType: 'REEL',
      title: chunk.title ?? undefined,
      startTime: this.toOptionalNumber(chunk.startTime),
      endTime: this.toOptionalNumber(chunk.endTime),
      quote: this.exactQuote(chunk.chunkText, 240),
    }));
  }

  private toOptionalNumber(
    value: number | null | undefined,
  ): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
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
