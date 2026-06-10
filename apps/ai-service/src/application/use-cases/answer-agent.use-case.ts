import { BuildChatPromptUseCase } from '@ai/application/use-cases/build-chat-prompt.use-case';
import type { IChatTokenPublisher } from '@ai/domain/interfaces/chat-token-publisher.interface';
import type { ILlmService } from '@ai/domain/interfaces/llm.service.interface';
import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AnswerAgentUseCase {
  constructor(
    @Inject('ILlmService')
    private readonly llmService: ILlmService,

    @Inject('IChatTokenPublisher')
    private readonly chatTokenPublisher: IChatTokenPublisher,

    private readonly buildChatPromptUseCase: BuildChatPromptUseCase,
  ) {}

  async execute(state: RagChatWorkflowState): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(state);

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

  private buildSystemPrompt(state: RagChatWorkflowState): string {
    const prompt = this.buildChatPromptUseCase.execute({
      currentMessage: state.userMessage,
      memory: state.memory,
      conversationMemory: state.conversationMemory,
      userMemories: state.userMemories,
      retrievedChunks: state.rerankedChunks,
    });

    const revisionInstruction = state.verification?.revisedInstruction?.trim();

    if (!revisionInstruction) {
      return prompt;
    }

    return `
${prompt}

VERIFIER REVISION INSTRUCTION:
${revisionInstruction}
`.trim();
  }
}
