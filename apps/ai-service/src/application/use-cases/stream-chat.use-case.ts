import type { IContentService } from '@ai/domain/interfaces/content.service.interface';
import { Inject, Injectable } from '@nestjs/common';
import type { IEmbeddingService } from '../../domain/interfaces/embedding.service.interface';
import type { ILlmService } from '../../domain/interfaces/llm.service.interface';

@Injectable()
export class StreamChatUseCase {
  constructor(
    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
    @Inject('ILlmService') private readonly llmService: ILlmService,
    @Inject('IContentService') private readonly contentService: IContentService,
  ) {}

  async execute(
    userMessage: string,
    userId: string,
    onToken: (token: string) => void,
  ): Promise<string> {
    const queryVector: number[] =
      await this.embeddingService.generateVector(userMessage);

    const matches = await this.contentService.searchTranscripts(queryVector);

    const context: string =
      matches.length > 0
        ? matches.map((m) => m.transcript).join('\n\n---\n\n')
        : 'No relevant video content found.';

    const systemPrompt: string = `
      You are an AI assistant for Velora application.
      Answer the user's question using ONLY the context provided below from our video transcripts.
      If the answer is not contained in the context, politely say "I'm sorry, I don't have information about that in my videos."

      CONTEXT:
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
