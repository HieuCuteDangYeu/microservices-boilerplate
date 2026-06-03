import type { IContentService } from '@ai/domain/interfaces/content.service.interface';
import type { IRerankerService } from '@ai/domain/interfaces/reranker.service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';
import type { ILlmService } from '../../domain/interfaces/llm.service.interface';

@Injectable()
export class StreamChatUseCase {
  private readonly logger = new Logger(StreamChatUseCase.name);

  constructor(
    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
    @Inject('ILlmService')
    private readonly llmService: ILlmService,
    @Inject('IContentService')
    private readonly contentService: IContentService,
    @Inject('IRerankerService')
    private readonly rerankerService: IRerankerService,
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

    const rerankedMatches = await this.rerankerService.rerank({
      queryText: userMessage,
      candidates: matches,
      limit: 5,
    });

    this.logger.log(
      `[RAG] retrieved=${matches.length} reranked=${rerankedMatches.length} top=${rerankedMatches
        .map((item) => `${item.matchedBy}:${item.score}:${item.chunkId}`)
        .join(',')}`,
    );

    const context =
      rerankedMatches.length > 0
        ? rerankedMatches
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
                match.matchedBy ? `Matched by: ${match.matchedBy}` : undefined,
                match.score !== undefined
                  ? `Retrieval score: ${match.score}`
                  : undefined,
                match.vectorScore !== undefined
                  ? `Vector score: ${match.vectorScore}`
                  : undefined,
                match.keywordScore !== undefined
                  ? `Keyword score: ${match.keywordScore}`
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
