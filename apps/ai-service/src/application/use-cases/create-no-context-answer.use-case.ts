import type { IChatTokenPublisher } from '@ai/domain/interfaces/chat-token-publisher.interface';
import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CreateNoContextAnswerUseCase {
  constructor(
    @Inject('IChatTokenPublisher')
    private readonly chatTokenPublisher: IChatTokenPublisher,
  ) {}

  execute(state: RagChatWorkflowState): string {
    const answer =
      state.contextSufficiency?.missingInfo?.trim() ||
      'No relevant shared reel context is available in this conversation.';

    this.chatTokenPublisher.publishToken({
      conversationId: state.conversationId,
      userId: state.userId,
      token: answer,
    });

    return answer;
  }
}
