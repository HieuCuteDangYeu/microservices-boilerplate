#!/usr/bin/env node

import { GenerateDraftAnswerUseCase } from '../../apps/ai-service/src/application/use-cases/generate-draft-answer.use-case';
import { QueryRouterAgentUseCase } from '../../apps/ai-service/src/application/use-cases/query-router-agent.use-case';
import type { RagChatWorkflowState } from '../../apps/ai-service/src/domain/interfaces/rag-chat-workflow.interface';
import type { StructuredLlmCallDiagnostics } from '../../apps/ai-service/src/domain/interfaces/structured-llm.service.interface';
import { AiApplicationConfigAdapter } from '../../apps/ai-service/src/infrastructure/adapters/ai-application-config.adapter';
import { ChatPromptBuilderAdapter } from '../../apps/ai-service/src/infrastructure/adapters/chat-prompt-builder.adapter';
import { CloudflareStructuredLlmAdapter } from '../../apps/ai-service/src/infrastructure/adapters/cloudflare-structured-llm.adapter';
import { ConfigService } from '@nestjs/config';

type SmokeRole = 'ROUTER' | 'ANSWER';

interface SmokeSample {
  index: number;
  role: SmokeRole;
  success: boolean;
  latencyMs: number;
  calls: StructuredLlmCallDiagnostics[];
  errorCode?: string;
}

if (process.env.CLOUDFLARE_SEMANTIC_LATENCY_SMOKE !== 'true') {
  throw new Error(
    'Set CLOUDFLARE_SEMANTIC_LATENCY_SMOKE=true to run this synthetic provider smoke.',
  );
}

const role = String(
  process.env.CLOUDFLARE_SEMANTIC_LATENCY_SMOKE_ROLE ?? 'ROUTER',
) as SmokeRole;
const repeats = Number(
  process.env.CLOUDFLARE_SEMANTIC_LATENCY_SMOKE_REPEATS ?? '10',
);

if (!['ROUTER', 'ANSWER'].includes(role)) {
  throw new Error('Smoke role must be ROUTER or ANSWER');
}
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 20) {
  throw new Error('Smoke repeats must be an integer from 1 through 20');
}

const configService = new ConfigService(process.env);
const applicationConfig = new AiApplicationConfigAdapter(configService);
const structuredLlm = new CloudflareStructuredLlmAdapter(configService);
const promptBuilder = new ChatPromptBuilderAdapter();

function syntheticAnswerState(): RagChatWorkflowState {
  const evidenceText =
    'The speaker recommends storing resilient backups in different physical locations so a fire at one building does not destroy every copy. This is synthetic evidence and contains no user or production content.';
  return {
    userId: 'synthetic-smoke-user',
    conversationId: 'synthetic-smoke-conversation',
    userMessage:
      'What safety measure does the speaker recommend if a building has a fire?',
    route: {
      intent: 'REEL_VIDEO_QUESTION',
      needsRetrieval: true,
      needsUserMemory: false,
      needsConversationSummary: false,
      needsVerification: true,
      reelQuestionType: 'TRANSCRIPT_CONTENT',
      requiredEvidence: ['TRANSCRIPT'],
      recommendationAction: { type: 'NONE', reason: 'No discovery request.' },
      reason: 'The question asks what the speaker says.',
    },
    retrievedChunks: [],
    rerankedChunks: [
      {
        chunkId: 'synthetic-e0',
        reelId: 'synthetic-reel-a',
        chunkText: evidenceText,
        evidenceText,
        evidenceType: 'TRANSCRIPT',
        title: 'Synthetic resilience discussion',
        tags: ['synthetic', 'resilience'],
        distance: 0.05,
        score: 0.95,
      },
    ],
    draftHistory: [],
    citationAttempts: [],
    nextDraftSource: 'INITIAL',
    finalFailureSource: 'UNKNOWN',
    retryCount: 0,
    citationRetryCount: 0,
  } as unknown as RagChatWorkflowState;
}

async function runRouter(index: number): Promise<SmokeSample> {
  const startedAt = Date.now();
  try {
    const result = await new QueryRouterAgentUseCase(
      structuredLlm,
      applicationConfig,
    ).execute({
      message:
        'What safety measure does the speaker in the shared synthetic reel recommend if a building has a fire?',
      recentHistory:
        'USER: Use only the shared synthetic reel.\nASSISTANT: I will use authorized reel evidence.',
      hasSharedReelContext: true,
      sharedReelCount: 1,
    });
    const success =
      result.intent === 'REEL_VIDEO_QUESTION' &&
      result.reelQuestionType === 'TRANSCRIPT_CONTENT' &&
      result.needsRetrieval &&
      result.requiredEvidence.includes('TRANSCRIPT');
    return {
      index,
      role,
      success,
      latencyMs: Date.now() - startedAt,
      calls: result.diagnostics?.semanticCalls ?? [],
    };
  } catch (error: unknown) {
    return failedSample(index, startedAt, error);
  }
}

async function runAnswer(index: number): Promise<SmokeSample> {
  const startedAt = Date.now();
  try {
    const result = await new GenerateDraftAnswerUseCase(
      structuredLlm,
      promptBuilder,
      applicationConfig,
    ).execute(syntheticAnswerState());
    return {
      index,
      role,
      success:
        result.answer.trim().length > 0 &&
        result.claims.length > 0 &&
        result.claims.every((claim) => claim.evidenceIds.includes('e0')),
      latencyMs: Date.now() - startedAt,
      calls: result.diagnostics,
    };
  } catch (error: unknown) {
    return failedSample(index, startedAt, error);
  }
}

function failedSample(
  index: number,
  startedAt: number,
  error: unknown,
): SmokeSample {
  return {
    index,
    role,
    success: false,
    latencyMs: Date.now() - startedAt,
    calls: [],
    errorCode:
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : error instanceof Error
          ? error.name
          : 'UNKNOWN',
  };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function main(): Promise<void> {
  const samples: SmokeSample[] = [];
  for (let index = 1; index <= repeats; index += 1) {
    const sample =
      role === 'ROUTER' ? await runRouter(index) : await runAnswer(index);
    samples.push(sample);
    console.log(JSON.stringify({ type: 'sample', ...sample }));
  }

  const latencies = samples.map((sample) => sample.latencyMs);
  const summary = {
    type: 'summary',
    role,
    repeats,
    successes: samples.filter((sample) => sample.success).length,
    p50Ms: percentile(latencies, 0.5),
    p90Ms: percentile(latencies, 0.9),
    p95Ms: percentile(latencies, 0.95),
    maxMs: Math.max(...latencies),
    fallbackSamples: samples.filter((sample) => sample.calls.length > 1).length,
  };
  console.log(JSON.stringify(summary));
  if (summary.successes !== repeats) process.exitCode = 1;
}

void main();
