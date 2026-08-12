import type {
  RagRequiredEvidence,
  RagRetrievalMode,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';

export interface RagHierarchyShadowObservation {
  userId: string;
  conversationId: string;
  queryText: string;
  retrievalMode: Exclude<RagRetrievalMode, 'NONE'>;
  requiredEvidence: RagRequiredEvidence[];
  directChunkIds: string[];
  hierarchicalChunkIds: string[];
  directMs: number;
  hierarchicalMs: number;
  overlapAtK: number;
  jaccard: number;
}

export interface IRagHierarchyShadowObservationRepository {
  save(observation: RagHierarchyShadowObservation): Promise<void>;
}
