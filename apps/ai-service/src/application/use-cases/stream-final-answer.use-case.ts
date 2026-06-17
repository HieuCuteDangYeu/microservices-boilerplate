import type { IChatPromptBuilder } from '@ai/domain/interfaces/chat-prompt-builder.interface';
import type { IChatTokenPublisher } from '@ai/domain/interfaces/chat-token-publisher.interface';
import type { ILlmService } from '@ai/domain/interfaces/llm.service.interface';
import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class StreamFinalAnswerUseCase {
  private readonly logger = new Logger(StreamFinalAnswerUseCase.name);

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
      this.logger.debug(
        `[FinalAnswer] publishing existing verified answer length=${existingVerifiedAnswer.length}`,
      );

      this.publishExistingAnswer(state, existingVerifiedAnswer);
      return existingVerifiedAnswer;
    }

    const systemPrompt = this.chatPromptBuilder.build(state);

    const answer = await this.llmService.generateResponseStream(
      state.userMessage,
      systemPrompt,
      state.userId,
      (token: string) => {
        this.logger.debug(
          `[FinalAnswer] publishing token length=${token.length}`,
        );

        this.chatTokenPublisher.publishToken({
          conversationId: state.conversationId,
          userId: state.userId,
          token,
        });
      },
    );

    this.logger.debug(`[FinalAnswer] generated answer length=${answer.length}`);

    return answer;
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
