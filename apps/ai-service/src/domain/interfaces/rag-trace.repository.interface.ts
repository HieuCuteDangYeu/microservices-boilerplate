import type {
  RagTrace,
  RagWorkflowTraceMetrics,
} from '@ai/domain/entities/rag-trace.entity';
import type { RagCitation } from '@ai/domain/interfaces/rag-chat-workflow.interface';

export interface RagTraceCreateInput {
  userId: string;
  conversationId: string;
  message: string;

  intent?: string;
  needsRetrieval?: boolean;

  retrievedChunkIds?: string[];
  rerankedChunkIds?: string[];
  citations?: RagCitation[];

  answer?: string;
  verifierPassed?: boolean;
  verifierConfidence?: number;
  verifierIssues?: string[];

  latencyMs?: number;
  nodeTimings?: Record<string, number>;
  workflowMetrics?: RagWorkflowTraceMetrics;
}

export interface IRagTraceRepository {
  create(input: RagTraceCreateInput): Promise<RagTrace>;
}
