import type { RagChatWorkflowState } from '@ai/domain/interfaces/rag-chat-workflow.interface';

export interface IChatPromptBuilder {
  build(
    state: RagChatWorkflowState,
    options?: { includeRetrievedEvidence?: boolean },
  ): string;
}
