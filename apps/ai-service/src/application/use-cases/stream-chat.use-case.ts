import type {
  IRagChatWorkflow,
  RagChatWorkflowInput,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type { AiChatMemoryContext } from '@common/ai/interfaces/chat-memory-context.interface';
import { Inject, Injectable } from '@nestjs/common';

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
  }): Promise<string> {
    const result = await this.ragChatWorkflow.execute({
      message: input.message,
      userId: input.userId,
      conversationId: input.conversationId,
      memory: input.memory,
    } satisfies RagChatWorkflowInput);

    return result.answer;
  }
}
