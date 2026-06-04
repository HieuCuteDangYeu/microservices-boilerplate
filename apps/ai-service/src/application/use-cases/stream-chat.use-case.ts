import type { IChatTokenPublisher } from '@ai/domain/interfaces/chat-token-publisher.interface';
import type { IContentService } from '@ai/domain/interfaces/content.service.interface';
import type { IRerankerService } from '@ai/domain/interfaces/reranker.service.interface';
import type { AiChatMemoryContext } from '@common/ai/interfaces/chat-memory-context.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';
import type { ILlmService } from '../../domain/interfaces/llm.service.interface';
import { BuildChatPromptUseCase } from './build-chat-prompt.use-case';

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
    @Inject('IChatTokenPublisher')
    private readonly chatTokenPublisher: IChatTokenPublisher,
    private readonly buildChatPromptUseCase: BuildChatPromptUseCase,
  ) {}

  async execute(input: {
    message: string;
    userId: string;
    conversationId: string;
    memory?: AiChatMemoryContext;
  }): Promise<string> {
    const queryEmbedding = await this.embeddingService.generateVector({
      text: input.message,
      taskType: 'RETRIEVAL_QUERY',
    });

    const matches = await this.contentService.searchReelContext({
      queryVector: queryEmbedding.values,
      queryText: input.message,
      userId: input.userId,
      limit: 8,
    });

    const rerankedMatches = await this.rerankerService.rerank({
      queryText: input.message,
      candidates: matches,
      limit: 5,
    });

    this.logger.log(
      `[RAG] conversation=${input.conversationId} retrieved=${matches.length} reranked=${rerankedMatches.length} memoryMessages=${input.memory?.recentMessages?.length ?? 0} top=${rerankedMatches
        .map(
          (item) =>
            `${item.matchedBy}:retrieval=${item.score ?? 'n/a'}:rerank=${item.rerankScore ?? 'n/a'}:${item.chunkId}`,
        )
        .join(',')}`,
    );

    const systemPrompt = this.buildChatPromptUseCase.execute({
      currentMessage: input.message,
      memory: input.memory,
      retrievedChunks: rerankedMatches,
    });

    return await this.llmService.generateResponseStream(
      input.message,
      systemPrompt,
      input.userId,
      (token: string) => {
        this.chatTokenPublisher.publishToken({
          conversationId: input.conversationId,
          userId: input.userId,
          token,
        });
      },
    );
  }
}
