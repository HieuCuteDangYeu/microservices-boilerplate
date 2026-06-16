import type { IChatPromptBuilder } from '@ai/domain/interfaces/chat-prompt-builder.interface';
import type { ILlmService } from '@ai/domain/interfaces/llm.service.interface';
import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GenerateDraftAnswerUseCase {
  constructor(
    @Inject('ILlmService')
    private readonly llmService: ILlmService,

    @Inject('IChatPromptBuilder')
    private readonly chatPromptBuilder: IChatPromptBuilder,
  ) {}

  async execute(state: RagChatWorkflowState): Promise<string> {
    const systemPrompt = this.chatPromptBuilder.build(state);

    return await this.llmService.generateResponseStream(
      state.userMessage,
      systemPrompt,
      state.userId,
      () => {
        // Draft generation must not stream tokens to the user.
      },
    );
  }
}
