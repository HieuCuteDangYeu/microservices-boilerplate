import type { AiChatMemoryContext } from '@common/ai/interfaces/chat-memory-context.interface';
import type { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BuildChatPromptUseCase {
  execute(input: {
    currentMessage: string;
    memory?: AiChatMemoryContext;
    retrievedChunks: ReelContextSearchResult[];
  }): string {
    const recentHistory = this.formatRecentHistory(input.memory);
    const reelContext = this.formatRetrievedChunks(input.retrievedChunks);

    return `
You are Velora AI, an intelligent assistant for the Velora platform.

Velora helps users:
- Create and share video reels
- Watch and discover reel content
- Chat with other users
- Ask AI questions about reel content

Use the conversation memory to understand follow-up questions.
Use retrieved reel chunks when the user asks about reel/video content.

Rules:
1. If the user asks about reel/video content, answer only from the retrieved chunks.
2. If no relevant chunks are found for a reel/video question, say you could not find relevant reel content.
3. If the question is about general Velora features, you may answer generally.
4. Do not invent reel details that are not in the retrieved chunks.
5. When useful, mention the source title and timestamp.
6. Keep the answer clear and concise.
7. Do not reveal internal retrieval scores unless the user asks for debugging.

RECENT CHAT HISTORY:
${recentHistory}

RETRIEVED REEL CHUNKS:
${reelContext}

CURRENT USER QUESTION:
${input.currentMessage}
    `.trim();
  }

  private formatRecentHistory(memory?: AiChatMemoryContext): string {
    const messages = memory?.recentMessages ?? [];

    if (messages.length === 0) {
      return 'No recent conversation context.';
    }

    return messages
      .map((message) => {
        const role = message.role === 'assistant' ? 'ASSISTANT' : 'USER';
        return `${role}: ${message.content}`;
      })
      .join('\n');
  }

  private formatRetrievedChunks(chunks: ReelContextSearchResult[]): string {
    if (chunks.length === 0) {
      return 'No relevant reel chunks found.';
    }

    return chunks
      .map((match, index) =>
        [
          `Source ${index + 1}`,
          `Reel ID: ${match.reelId}`,
          `Chunk ID: ${match.chunkId}`,
          match.title ? `Title: ${match.title}` : undefined,
          match.description ? `Description: ${match.description}` : undefined,
          match.tags.length > 0 ? `Tags: ${match.tags.join(', ')}` : undefined,
          match.startTime !== undefined && match.endTime !== undefined
            ? `Timestamp: ${match.startTime.toFixed(1)}s - ${match.endTime.toFixed(1)}s`
            : undefined,
          match.matchedBy ? `Matched by: ${match.matchedBy}` : undefined,
          match.score !== undefined
            ? `Retrieval score: ${match.score}`
            : undefined,
          match.rerankScore !== undefined
            ? `Rerank score: ${match.rerankScore}`
            : undefined,
          match.vectorScore !== undefined
            ? `Vector score: ${match.vectorScore}`
            : undefined,
          match.keywordScore !== undefined
            ? `Keyword score: ${match.keywordScore}`
            : undefined,
          match.distance !== null
            ? `Similarity distance: ${match.distance}`
            : undefined,
          `Content:\n${match.chunkText}`,
        ]
          .filter((line): line is string => Boolean(line))
          .join('\n'),
      )
      .join('\n\n---\n\n');
  }
}
