import type { IContentService } from '@ai/domain/interfaces/content.service.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';
import type { ILlmService } from '../../domain/interfaces/llm.service.interface';

@Injectable()
export class StreamChatUseCase {
  constructor(
    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
    @Inject('ILlmService')
    private readonly llmService: ILlmService,
    @Inject('IContentService')
    private readonly contentService: IContentService,
  ) {}

  async execute(
    userMessage: string,
    userId: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    const queryEmbedding = await this.embeddingService.generateVector({
      text: userMessage,
      taskType: 'RETRIEVAL_QUERY',
    });

    const matches = await this.contentService.searchReelContext({
      queryVector: queryEmbedding.values,
      queryText: userMessage,
      userId,
      limit: 8,
    });

    const context =
      matches.length > 0
        ? matches
            .map((match, index) =>
              [
                `Source ${index + 1}`,
                `Reel ID: ${match.reelId}`,
                `Chunk ID: ${match.chunkId}`,
                match.title ? `Title: ${match.title}` : undefined,
                match.description
                  ? `Description: ${match.description}`
                  : undefined,
                match.tags.length > 0
                  ? `Tags: ${match.tags.join(', ')}`
                  : undefined,
                match.startTime !== undefined && match.endTime !== undefined
                  ? `Timestamp: ${match.startTime.toFixed(1)}s - ${match.endTime.toFixed(1)}s`
                  : undefined,
                `Similarity distance: ${match.distance}`,
                `Content:\n${match.chunkText}`,
              ]
                .filter((line): line is string => Boolean(line))
                .join('\n'),
            )
            .join('\n\n---\n\n')
        : 'No relevant reel chunks found.';

    const systemPrompt = `
    You are Velora AI, an intelligent assistant for the Velora platform.

    Velora helps users:
    - Create and share video reels
    - Watch and discover reel content
    - Chat with other users
    - Ask AI questions about reel content

    Use the retrieved reel chunks below when they are relevant.

    Rules:
    1. If the user asks about reel/video content, answer only from the retrieved chunks.
    2. If no relevant chunks are found, say you could not find relevant reel content.
    3. If the question is about general Velora features, you may answer generally.
    4. Do not invent reel details that are not in the retrieved chunks.
    5. When useful, mention the source title and timestamp.
    6. Keep the answer clear and concise.

    RETRIEVED REEL CHUNKS:
    ${context}
    `.trim();

    return await this.llmService.generateResponseStream(
      userMessage,
      systemPrompt,
      userId,
      onToken,
    );
  }
}
