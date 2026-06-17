import type { IChatTokenPublisher } from '@ai/domain/interfaces/chat-token-publisher.interface';
import type {
  RagChatWorkflowState,
  RagRequiredEvidence,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CreateNoContextAnswerUseCase {
  constructor(
    @Inject('IChatTokenPublisher')
    private readonly chatTokenPublisher: IChatTokenPublisher,
  ) {}

  execute(state: RagChatWorkflowState): string {
    const answer = this.buildAnswer(state);

    this.chatTokenPublisher.publishToken({
      conversationId: state.conversationId,
      userId: state.userId,
      token: answer,
    });

    return answer;
  }

  private buildAnswer(state: RagChatWorkflowState): string {
    const userFacingReason = state.contextSufficiency?.userFacingReason?.trim();

    if (userFacingReason) {
      return userFacingReason;
    }

    const missingEvidence = state.contextSufficiency?.missingEvidence ?? [];

    if (missingEvidence.length > 0) {
      return this.renderMissingEvidenceAnswer(missingEvidence);
    }

    if (state.route?.intent === 'REEL_VIDEO_QUESTION') {
      return 'I do not have enough relevant shared reel context to answer that reliably.';
    }

    return 'I do not have enough context to answer that reliably.';
  }

  private renderMissingEvidenceAnswer(
    missingEvidence: RagRequiredEvidence[],
  ): string {
    if (missingEvidence.includes('VISUAL')) {
      return 'I do not have enough visual evidence from the shared reel to answer that reliably.';
    }

    if (missingEvidence.includes('TRANSCRIPT')) {
      return 'I do not have enough relevant shared reel transcript context to answer that reliably.';
    }

    if (missingEvidence.includes('METADATA')) {
      return 'I do not have enough shared reel metadata to answer that reliably.';
    }

    if (missingEvidence.includes('AUDIO')) {
      return 'I do not have enough audio evidence from the shared reel to answer that reliably.';
    }

    return 'I do not have enough evidence to answer that reliably.';
  }
}
