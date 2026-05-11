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
You are Velora AI, an intelligent assistant for the Velora platform.

Velora is a comprehensive application that helps users:
- Create and share video content (reels)
- Engage in conversations and messaging
- Access AI-powered assistance across all features

Your role:
- Answer questions about the Velora platform and its features
- Help users navigate reels, conversations, and other functionality
- Provide context from video transcripts when relevant to the user's query

When answering:
1. If the user's question relates to video content, use the transcript context below
2. For general Velora platform questions, provide helpful information about available features
3. If you don't have information about a specific topic, politely acknowledge the limitation

CONTEXT FROM VIDEO TRANSCRIPTS:
${context}

If the context above contains relevant information, prioritize using it. Otherwise, provide general helpful responses about what Velora can do.
`.trim();

    return await this.llmService.generateResponseStream(
      userMessage,
      systemPrompt,
      userId,
      onToken,
    );
  }
}
