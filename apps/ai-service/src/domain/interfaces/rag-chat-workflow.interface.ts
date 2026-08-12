import type {
  AiRagCitation,
  AiRecommendedReel,
} from '@common/ai/dtos/ask-question-response.dto';
import type { AiChatMemoryContext } from '@common/ai/interfaces/chat-memory-context.interface';
import type { ConversationMemoryContext } from '@common/ai/interfaces/conversation-memory.interface';
import type { RelevantUserMemoriesContext } from '@common/ai/interfaces/user-memory.interface';
import type { ReelContextSearchResult } from '@common/content/interfaces/reel-context-search-result.interface';

export type RagChatIntent =
  | 'NORMAL_CHAT'
  | 'REEL_VIDEO_QUESTION'
  | 'CONVERSATION_MEMORY_QUESTION'
  | 'USER_MEMORY_QUESTION'
  | 'TASK_ACTION_REQUEST';

export type RagReelQuestionType =
  | 'NONE'
  | 'TRANSCRIPT_CONTENT'
  | 'VISUAL_CONTENT'
  | 'GENERAL_REEL_SUMMARY'
  | 'REEL_METADATA'
  | 'AMBIGUOUS_REEL_REFERENCE';

export type RagRequiredEvidence =
  | 'NONE'
  | 'TRANSCRIPT'
  | 'VISUAL'
  | 'AUDIO'
  | 'METADATA'
  | 'CONVERSATION_MEMORY'
  | 'USER_MEMORY';

export type RagRecommendationAction =
  | {
      type: 'NONE';
      reason: string;
    }
  | {
      type: 'RECOMMEND_REELS';
      query?: string;
      minRelevantItems: number;
      allowPersonalizedFallback: boolean;
      reason: string;
    }
  | {
      type: 'SUGGEST_QUERIES';
      query?: string;
      suggestedQueries: string[];
      reason: string;
    };

export interface RagChatRouteDecision {
  intent: RagChatIntent;
  needsRetrieval: boolean;
  needsUserMemory: boolean;
  needsConversationSummary: boolean;
  needsVerification: boolean;

  reelQuestionType: RagReelQuestionType;
  requiredEvidence: RagRequiredEvidence[];

  recommendationAction: RagRecommendationAction;

  reason: string;
}

export type RagRetrievalMode = 'NONE' | 'REEL_VECTOR' | 'REEL_HYBRID';

export interface RagRetrievalPlan {
  mode: RagRetrievalMode;
  query: string;
  rewrittenQuery?: string;
  queries?: string[];
  searchLimit: number;
  rerankLimit: number;
  shouldRerank: boolean;
  reason: string;
}

export interface RagMemorySelection {
  includeRecentHistory: boolean;
  includeConversationSummary: boolean;
  includeUserMemory: boolean;
  includeRetrievedChunks: boolean;
  reason: string;
}

export interface RagVerificationResult {
  passed: boolean;
  confidence: number;
  issues: string[];
  requiresRevision: boolean;
  revisedInstruction?: string;
}

export interface RagContextSufficiencyResult {
  sufficient: boolean;
  confidence: number;

  availableEvidence: RagRequiredEvidence[];
  missingEvidence: RagRequiredEvidence[];

  reason: string;
  userFacingReason?: string;

  recommendedAction: 'ANSWER' | 'REFUSE_NO_CONTEXT' | 'REWRITE_AND_RETRY';
}

export interface RagCitationCoverageResult {
  mode: 'LLM' | 'FALLBACK' | 'NOT_REQUIRED';
  coverage: number;
  factualClaimCount: number;
  supportedClaimCount: number;
  unsupportedClaims: string[];
}

export type RagCitation = AiRagCitation;

export interface RagChatWorkflowInput {
  message: string;
  userId: string;
  conversationId: string;
  memory?: AiChatMemoryContext;
}

export interface RagChatWorkflowResult {
  answer: string;
  citations?: RagCitation[];
  recommendedReels?: AiRecommendedReel[];
  suggestedQueries?: string[];
}

export interface RagChatWorkflowState {
  userId: string;
  conversationId: string;
  userMessage: string;
  memory?: AiChatMemoryContext;

  accessibleReelIds?: string[];
  hasSharedReelContext?: boolean;

  route?: RagChatRouteDecision;
  retrievalPlan?: RagRetrievalPlan;
  retrievalRepairQuery?: string;

  retrievedChunks: ReelContextSearchResult[];
  rerankedChunks: ReelContextSearchResult[];
  retrievalReady?: boolean;

  recommendedReels?: AiRecommendedReel[];
  suggestedQueries?: string[];

  contextSufficiency?: RagContextSufficiencyResult;

  conversationMemory?: ConversationMemoryContext;
  userMemories?: RelevantUserMemoriesContext;
  memorySelection?: RagMemorySelection;
  memoryReady?: boolean;

  answer?: string;
  verification?: RagVerificationResult;
  citations?: RagCitation[];
  citationCoverage?: RagCitationCoverageResult;

  retryCount: number;
  retrievalRetryCount: number;
  citationRetryCount: number;
}

export interface IRagChatWorkflow {
  execute(input: RagChatWorkflowInput): Promise<RagChatWorkflowResult>;
}
