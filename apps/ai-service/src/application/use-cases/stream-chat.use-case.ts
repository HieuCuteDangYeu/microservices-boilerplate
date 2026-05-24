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
    const queryVector: number[] = await this.embeddingService.generateVector({
      text: userMessage,
      taskType: 'RETRIEVAL_QUERY',
    });

    const matches = await this.contentService.searchReelContext(
      queryVector,
      userId,
    );

    const context: string =
      matches.length > 0
        ? matches
            .map((match, index) =>
              [
                `Video ${index + 1}`,
                match.title ? `Title: ${match.title}` : undefined,
                match.description
                  ? `Description: ${match.description}`
                  : undefined,
                match.tags.length > 0
                  ? `Tags: ${match.tags.join(', ')}`
                  : undefined,
                match.transcript
                  ? `Transcript:\n${match.transcript}`
                  : 'Transcript unavailable.',
              ]
                .filter((line): line is string => Boolean(line))
                .join('\n'),
            )
            .join('\n\n---\n\n')
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
- Provide context from reel titles, descriptions, tags, and transcripts when relevant to the user's query

When answering:
1. If the user's question relates to video content, use the reel context below
2. For general Velora platform questions, provide helpful information about available features
3. If you don't have information about a specific topic, politely acknowledge the limitation

CONTEXT FROM REELS:
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
