import type { IChatPromptBuilder } from '@ai/domain/interfaces/chat-prompt-builder.interface';
import type { IChatTokenPublisher } from '@ai/domain/interfaces/chat-token-publisher.interface';
import type { ILlmService } from '@ai/domain/interfaces/llm.service.interface';
import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class StreamFinalAnswerUseCase {
  constructor(
    @Inject('ILlmService')
    private readonly llmService: ILlmService,

    @Inject('IChatTokenPublisher')
    private readonly chatTokenPublisher: IChatTokenPublisher,

    @Inject('IChatPromptBuilder')
    private readonly chatPromptBuilder: IChatPromptBuilder,
  ) {}

  async execute(state: RagChatWorkflowState): Promise<string> {
    const existingVerifiedAnswer = state.answer?.trim();

    if (existingVerifiedAnswer) {
      this.publishExistingAnswer(state, existingVerifiedAnswer);
      return existingVerifiedAnswer;
    }

    const systemPrompt = this.chatPromptBuilder.build(state);

    return await this.llmService.generateResponseStream(
      state.userMessage,
      systemPrompt,
      state.userId,
      (token: string) => {
        this.chatTokenPublisher.publishToken({
          conversationId: state.conversationId,
          userId: state.userId,
          token,
        });
      },
    );
  }

  private publishExistingAnswer(
    state: RagChatWorkflowState,
    answer: string,
  ): void {
    for (const token of this.chunkAnswer(answer)) {
      this.chatTokenPublisher.publishToken({
        conversationId: state.conversationId,
        userId: state.userId,
        token,
      });
    }
  }

  private chunkAnswer(answer: string): string[] {
    const maxLength = 80;
    const chunks: string[] = [];

    for (let index = 0; index < answer.length; index += maxLength) {
      chunks.push(answer.slice(index, index + maxLength));
    }

    return chunks;
  }
}
