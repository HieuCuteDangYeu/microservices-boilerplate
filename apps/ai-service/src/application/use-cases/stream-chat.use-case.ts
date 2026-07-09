import type {
  IRagChatWorkflow,
  RagChatWorkflowInput,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { AiRecommendedReel } from '@common/ai/dtos/ask-question-response.dto';
import type { AiChatMemoryContext } from '@common/ai/interfaces/chat-memory-context.interface';
import { Inject, Injectable } from '@nestjs/common';

export interface StreamChatResult {
  answer: string;
  recommendedReels?: AiRecommendedReel[];
  suggestedQueries?: string[];
}

@Injectable()
export class StreamChatUseCase {
  constructor(
    @Inject('IRagChatWorkflow')
    private readonly ragChatWorkflow: IRagChatWorkflow,
  ) {}

  async execute(input: {
    message: string;
    userId: string;
    conversationId: string;
    memory?: AiChatMemoryContext;
  }): Promise<StreamChatResult> {
    const result = await this.ragChatWorkflow.execute({
      message: input.message,
      userId: input.userId,
      conversationId: input.conversationId,
      memory: input.memory,
    } satisfies RagChatWorkflowInput);

    return {
      answer: result.answer,
      recommendedReels: result.recommendedReels,
      suggestedQueries: result.suggestedQueries,
    };
  }
}
