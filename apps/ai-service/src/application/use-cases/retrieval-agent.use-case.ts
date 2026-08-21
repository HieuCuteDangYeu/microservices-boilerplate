import type { TranscriptMatch } from '@ai/domain/interfaces/content-service.interface';
import type {
  RagChatRouteDecision,
  RagRetrievalPlan,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';

/**
 * Workflow-facing retrieval agent contract.
 *
 * This class exists as a runtime Nest DI token. The tool-calling retrieval
 * agent implements this contract, while deterministic retrieval execution is
 * provided separately through IRetrievalEngine.
 */
export abstract class RetrievalAgentUseCase {
  abstract plan(input: {
    message: string;
    route: RagChatRouteDecision;
  }): Promise<RagRetrievalPlan>;

  abstract retrieve(input: {
    userId: string;
    conversationId: string;
    route: RagChatRouteDecision;
    plan: RagRetrievalPlan;
    accessibleReelIds?: string[];
  }): Promise<TranscriptMatch[]>;

  abstract rerank(input: {
    plan: RagRetrievalPlan;
    retrievedChunks: TranscriptMatch[];
  }): Promise<TranscriptMatch[]>;
}
