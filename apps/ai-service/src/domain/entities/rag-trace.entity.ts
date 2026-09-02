import type {
  RagCitation,
  RagWorkflowFailureDiagnostics,
} from '@ai/domain/interfaces/rag-chat-workflow.interface';

export interface RagWorkflowTraceMetrics {
  retrievalRetryCount: number;
  answerRetryCount: number;
  citationRetryCount: number;
  citationCoverageMode?: 'LLM' | 'DETERMINISTIC' | 'FALLBACK' | 'NOT_REQUIRED';
  citationCoverage?: number;
  factualClaimCount?: number;
  supportedClaimCount?: number;
  diagnostics?: {
    contextSufficiency?: unknown;
    route?: unknown;
    retrievalPlan?: unknown;
    retrievalCounts?: { retrieved: number; reranked: number };
    draftHistory?: unknown[];
    groundedRevision?: unknown;
    answerClaims?: unknown[];
    answerCalls?: unknown[];
    verification?: unknown;
    citationAttempts?: unknown[];
    finalFailureSource?: string;
    failure?: RagWorkflowFailureDiagnostics;
  };
}

export interface RagTraceProps {
  id: string;

  userId: string;
  conversationId: string;
  message: string;

  intent?: string;
  needsRetrieval: boolean;

  retrievedChunkIds: string[];
  rerankedChunkIds: string[];
  citations: RagCitation[];

  answer?: string;
  verifierPassed?: boolean;
  verifierConfidence?: number;
  verifierIssues: string[];

  latencyMs?: number;
  nodeTimings: Record<string, number>;
  workflowMetrics: RagWorkflowTraceMetrics;

  createdAt: Date;
}

export class RagTrace {
  readonly id: string;

  readonly userId: string;
  readonly conversationId: string;
  readonly message: string;

  readonly intent?: string;
  readonly needsRetrieval: boolean;

  readonly retrievedChunkIds: string[];
  readonly rerankedChunkIds: string[];
  readonly citations: RagCitation[];

  readonly answer?: string;
  readonly verifierPassed?: boolean;
  readonly verifierConfidence?: number;
  readonly verifierIssues: string[];

  readonly latencyMs?: number;
  readonly nodeTimings: Record<string, number>;
  readonly workflowMetrics: RagWorkflowTraceMetrics;

  readonly createdAt: Date;

  constructor(props: RagTraceProps) {
    this.id = props.id;

    this.userId = props.userId;
    this.conversationId = props.conversationId;
    this.message = props.message;

    this.intent = props.intent;
    this.needsRetrieval = props.needsRetrieval;

    this.retrievedChunkIds = props.retrievedChunkIds;
    this.rerankedChunkIds = props.rerankedChunkIds;
    this.citations = props.citations;

    this.answer = props.answer;
    this.verifierPassed = props.verifierPassed;
    this.verifierConfidence = props.verifierConfidence;
    this.verifierIssues = props.verifierIssues;

    this.latencyMs = props.latencyMs;
    this.nodeTimings = props.nodeTimings;
    this.workflowMetrics = props.workflowMetrics;

    this.createdAt = props.createdAt;
  }
}
