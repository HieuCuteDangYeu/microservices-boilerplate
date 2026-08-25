#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { ConfigService } = require('@nestjs/config');
const {
  routerCases,
  sufficiencyCases,
  verifierCases,
} = require('./rag-control-plane-fixtures.cjs');

const ROOT = path.resolve(__dirname, '../..');
const compiledRoot = path.join(
  ROOT,
  'dist/apps/ai-service/apps/ai-service/src',
);
const load = (relative) => require(path.join(compiledRoot, relative));
const { QueryRouterAgentUseCase } = load(
  'application/use-cases/query-router-agent.use-case.js',
);
const { CheckContextSufficiencyUseCase } = load(
  'application/use-cases/check-context-sufficiency.use-case.js',
);
const { VerifierAgentUseCase } = load(
  'application/use-cases/verifier-agent.use-case.js',
);
const { AiApplicationConfigAdapter } = load(
  'infrastructure/adapters/ai-application-config.adapter.js',
);
const { CloudflareStructuredLlmAdapter } = load(
  'infrastructure/adapters/cloudflare-structured-llm.adapter.js',
);

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] || 0;
}

function sameArray(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function normalizeCalls(calls) {
  return calls.map((call) => ({
    modelRole: call.modelRole,
    model: call.model,
    inputTokens: call.usage?.inputTokens ?? null,
    outputTokens: call.usage?.outputTokens ?? null,
    totalTokens: call.usage?.totalTokens ?? null,
    usageSource: call.usage ? 'PROVIDER' : 'UNAVAILABLE',
    latencyMs: call.latencyMs,
    finishReason: call.finishReason,
    attempt: call.attempt ?? 1,
    providerStatus: call.providerStatus,
    providerCode: call.providerCode,
    providerCategory: call.providerCategory,
    retryAfterMs: call.retryAfterMs,
    transient: call.transient,
    errorCode: call.errorCode,
    scope: 'QUERY',
  }));
}

function accountLimited(calls) {
  return calls.some((call) => call.providerCategory === 'ACCOUNT_LIMITED');
}

function stateForSufficiency(fixture) {
  return {
    userId: 'synthetic-evaluation-user',
    conversationId: 'synthetic-evaluation-conversation',
    userMessage: fixture.question,
    route: {
      intent: 'REEL_VIDEO_QUESTION',
      referenceTarget: 'SHARED_REEL',
      needsRetrieval: true,
      needsUserMemory: false,
      needsConversationSummary: false,
      needsVerification: true,
      reelQuestionType:
        fixture.requiredEvidence[0] === 'VISUAL'
          ? 'VISUAL_CONTENT'
          : fixture.requiredEvidence[0] === 'METADATA'
            ? 'REEL_METADATA'
            : 'TRANSCRIPT_CONTENT',
      requiredEvidence: fixture.requiredEvidence,
      recommendationAction: { type: 'NONE', reason: 'No discovery.' },
      reason: 'Synthetic evaluation route.',
    },
    retrievedChunks: [],
    rerankedChunks: fixture.evidence.map((item, index) => ({
      ...item,
      chunkId: `e${index}`,
      reelId: 'synthetic-authorized-reel',
      chunkText: item.evidenceText,
      tags: [],
      startTime: index * 10,
      endTime: index * 10 + 8,
    })),
    draftHistory: [],
    citationAttempts: [],
    nextDraftSource: 'INITIAL',
    finalFailureSource: 'UNKNOWN',
    retryCount: 0,
    citationRetryCount: 0,
  };
}

function stateForVerifier(fixture) {
  const state = stateForSufficiency({
    question: fixture.question,
    requiredEvidence: ['TRANSCRIPT'],
    evidence: fixture.evidence,
  });
  return {
    ...state,
    answer: fixture.answer,
    answerClaims: [{ claim: fixture.claim, evidenceIds: ['e0'] }],
  };
}

async function evaluateRouter(llm, config, model, callLog) {
  const modelConfig = {
    model: (role) => (role === 'ROUTER' ? model : config.model(role)),
    get: (key) =>
      key === 'AI_ROUTER_FALLBACK_MODEL' ? undefined : config.get(key),
    timeoutMs: (role) => config.timeoutMs(role),
    maxCompletionTokens: (role) => config.maxCompletionTokens(role),
    number: (key, fallback, min, max) => config.number(key, fallback, min, max),
    boolean: (key, fallback) => config.boolean(key, fallback),
  };
  const useCase = new QueryRouterAgentUseCase(llm, modelConfig);
  const samples = [];
  const limit = Number(arg('--limit') || routerCases.length);
  const fixtures = routerCases.slice(0, limit);
  for (const fixture of fixtures) {
    const startedAt = Date.now();
    const callOffset = callLog.length;
    try {
      const result = await useCase.execute(fixture);
      const strictPass =
        result.intent === fixture.expected.intent &&
        result.referenceTarget === fixture.expected.referenceTarget &&
        result.reelQuestionType === fixture.expected.reelQuestionType &&
        sameArray(result.requiredEvidence, fixture.expected.requiredEvidence);
      samples.push({
        id: fixture.id,
        success: true,
        strictPass,
        expectedIntent: fixture.expected.intent,
        actualIntent: result.intent,
        expectedReferenceTarget: fixture.expected.referenceTarget,
        actualReferenceTarget: result.referenceTarget,
        expectedReelQuestionType: fixture.expected.reelQuestionType,
        actualReelQuestionType: result.reelQuestionType,
        expectedRequiredEvidence: fixture.expected.requiredEvidence,
        actualRequiredEvidence: result.requiredEvidence,
        referencePass:
          result.referenceTarget === fixture.expected.referenceTarget,
        evidencePass: sameArray(
          result.requiredEvidence,
          fixture.expected.requiredEvidence,
        ),
        latencyMs: Date.now() - startedAt,
        calls: normalizeCalls(callLog.slice(callOffset)),
      });
    } catch (error) {
      samples.push({
        id: fixture.id,
        success: false,
        strictPass: false,
        expectedIntent: fixture.expected.intent,
        expectedReferenceTarget: fixture.expected.referenceTarget,
        actualReferenceTarget: null,
        expectedReelQuestionType: fixture.expected.reelQuestionType,
        actualReelQuestionType: null,
        expectedRequiredEvidence: fixture.expected.requiredEvidence,
        actualRequiredEvidence: [],
        latencyMs: Date.now() - startedAt,
        errorCode: error?.causeCode || error?.code || error?.name || 'ERROR',
        calls: normalizeCalls(callLog.slice(callOffset)),
      });
    }
    if (accountLimited(samples.at(-1).calls)) break;
  }
  const expectedReel = samples.filter(
    (sample) => sample.expectedIntent === 'REEL_VIDEO_QUESTION',
  );
  const expectedNonReel = samples.filter(
    (sample) => sample.expectedIntent !== 'REEL_VIDEO_QUESTION',
  );
  const calls = samples.flatMap((sample) => sample.calls);
  return {
    mode: 'ROUTER',
    model,
    caseCount: samples.length,
    accuracy:
      samples.filter((sample) => sample.strictPass).length / samples.length,
    intentAccuracy:
      samples.filter((sample) => sample.actualIntent === sample.expectedIntent)
        .length / samples.length,
    referenceAccuracy:
      samples.filter((sample) => sample.referencePass).length / samples.length,
    requiredEvidenceAccuracy:
      samples.filter((sample) => sample.evidencePass).length / samples.length,
    falseNormalChatRate:
      expectedReel.filter((sample) => sample.actualIntent === 'NORMAL_CHAT')
        .length / expectedReel.length,
    falseReelRate:
      expectedNonReel.filter(
        (sample) => sample.actualIntent === 'REEL_VIDEO_QUESTION',
      ).length / expectedNonReel.length,
    schemaSuccessRate:
      samples.filter(
        (sample) =>
          sample.success &&
          !sample.calls.some(
            (call) => call.errorCode === 'STRUCTURED_COMPLETION_SCHEMA_INVALID',
          ),
      ).length / samples.length,
    timeoutRate:
      samples.filter(
        (sample) =>
          sample.errorCode === 'STRUCTURED_COMPLETION_TIMEOUT' ||
          sample.calls.some((call) => call.providerStatus === 'TIMEOUT'),
      ).length / samples.length,
    providerFailureRate:
      samples.filter(
        (sample) =>
          sample.errorCode === 'STRUCTURED_COMPLETION_PROVIDER_ERROR' ||
          sample.calls.some(
            (call) => call.errorCode === 'STRUCTURED_COMPLETION_PROVIDER_ERROR',
          ),
      ).length / samples.length,
    p50Ms: percentile(
      samples.map((sample) => sample.latencyMs),
      0.5,
    ),
    p90Ms: percentile(
      samples.map((sample) => sample.latencyMs),
      0.9,
    ),
    p95Ms: percentile(
      samples.map((sample) => sample.latencyMs),
      0.95,
    ),
    usage: calls.reduce(
      (usage, call) => ({
        inputTokens: usage.inputTokens + (call.usage?.inputTokens ?? 0),
        outputTokens: usage.outputTokens + (call.usage?.outputTokens ?? 0),
        totalTokens: usage.totalTokens + (call.usage?.totalTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    ),
    failures: samples
      .filter((sample) => !sample.strictPass)
      .map((sample) => ({
        id: sample.id,
        expectedIntent: sample.expectedIntent,
        actualIntent: sample.actualIntent,
        errorCode: sample.errorCode,
      })),
    samples,
    stoppedReason: samples.some((sample) => accountLimited(sample.calls))
      ? 'ACCOUNT_LIMITED'
      : null,
  };
}

async function evaluateSufficiency(llm, config, callLog) {
  const useCase = new CheckContextSufficiencyUseCase(llm, config);
  const samples = [];
  for (const fixture of sufficiencyCases) {
    const startedAt = Date.now();
    const callOffset = callLog.length;
    try {
      const result = await useCase.execute(stateForSufficiency(fixture));
      samples.push({
        id: fixture.id,
        success: true,
        pass: result.sufficient === fixture.expectedSufficient,
        expectedSufficient: fixture.expectedSufficient,
        actualSufficient: result.sufficient,
        expectedSupportedEvidenceIds:
          fixture.expectedSufficient && fixture.evidence.length > 0
            ? ['e0']
            : [],
        actualSupportedEvidenceIds: result.supportedEvidenceIds ?? [],
        expectedRecommendedAction: fixture.expectedSufficient
          ? 'ANSWER'
          : 'REFUSE_NO_CONTEXT',
        actualRecommendedAction: result.recommendedAction,
        providerStatus: result.diagnostics?.providerStatus,
        latencyMs: Date.now() - startedAt,
        calls: normalizeCalls(callLog.slice(callOffset)),
      });
    } catch (error) {
      samples.push({
        id: fixture.id,
        success: false,
        pass: false,
        expectedSufficient: fixture.expectedSufficient,
        actualSufficient: null,
        expectedSupportedEvidenceIds: [],
        actualSupportedEvidenceIds: [],
        expectedRecommendedAction: fixture.expectedSufficient
          ? 'ANSWER'
          : 'REFUSE_NO_CONTEXT',
        actualRecommendedAction: null,
        errorCode: error?.code || error?.name || 'ERROR',
        latencyMs: Date.now() - startedAt,
        calls: normalizeCalls(callLog.slice(callOffset)),
      });
    }
    if (accountLimited(samples.at(-1).calls)) break;
  }
  return {
    mode: 'SUFFICIENCY',
    caseCount: samples.length,
    passed: samples.filter((sample) => sample.pass).length,
    schemaErrors: samples.filter((sample) => sample.providerStatus === 'ERROR')
      .length,
    p50Ms: percentile(
      samples.map((sample) => sample.latencyMs),
      0.5,
    ),
    p90Ms: percentile(
      samples.map((sample) => sample.latencyMs),
      0.9,
    ),
    p95Ms: percentile(
      samples.map((sample) => sample.latencyMs),
      0.95,
    ),
    failures: samples
      .filter((sample) => !sample.pass)
      .map((sample) => sample.id),
    samples,
    stoppedReason: samples.some((sample) => accountLimited(sample.calls))
      ? 'ACCOUNT_LIMITED'
      : null,
  };
}

async function evaluateVerifier(llm, config, callLog) {
  const useCase = new VerifierAgentUseCase(llm, config);
  const samples = [];
  for (const fixture of verifierCases) {
    const startedAt = Date.now();
    const callOffset = callLog.length;
    try {
      const result = await useCase.verifyWithRole(
        stateForVerifier(fixture),
        'VERIFIER',
      );
      samples.push({
        id: fixture.id,
        success: true,
        expectedPassed: fixture.expectedPassed ?? true,
        actualPassed: result.passed,
        pass: result.passed === (fixture.expectedPassed ?? true),
        expectedSupportedEvidenceIds: fixture.expectedSupportedEvidenceIds ?? [
          'e0',
        ],
        actualSupportedEvidenceIds: [
          ...new Set(
            (result.supportedClaimMappings ?? []).flatMap(
              (mapping) => mapping.evidenceIds ?? [],
            ),
          ),
        ],
        expectedContradiction: fixture.expectedContradiction ?? false,
        actualContradiction: (result.contradictions ?? []).length > 0,
        latencyMs: Date.now() - startedAt,
        calls: normalizeCalls(callLog.slice(callOffset)),
      });
    } catch (error) {
      samples.push({
        id: fixture.id,
        success: false,
        expectedPassed: fixture.expectedPassed ?? true,
        actualPassed: null,
        pass: false,
        expectedSupportedEvidenceIds: fixture.expectedSupportedEvidenceIds ?? [
          'e0',
        ],
        actualSupportedEvidenceIds: [],
        expectedContradiction: fixture.expectedContradiction ?? false,
        actualContradiction: null,
        errorCode: error?.code || error?.name || 'ERROR',
        latencyMs: Date.now() - startedAt,
        calls: normalizeCalls(callLog.slice(callOffset)),
      });
    }
    if (accountLimited(samples.at(-1).calls)) break;
  }
  const latencies = samples.map((sample) => sample.latencyMs);
  return {
    mode: 'VERIFIER',
    caseCount: samples.length,
    passed: samples.filter((sample) => sample.pass).length,
    p50Ms: percentile(latencies, 0.5),
    p90Ms: percentile(latencies, 0.9),
    p95Ms: percentile(latencies, 0.95),
    maxMs: Math.max(...latencies),
    failures: samples
      .filter((sample) => !sample.pass)
      .map((sample) => sample.id),
    samples,
    stoppedReason: samples.some((sample) => accountLimited(sample.calls))
      ? 'ACCOUNT_LIMITED'
      : null,
  };
}

async function main() {
  dotenv.config({
    path: arg('--env-file') || path.join(ROOT, '.env.test.local'),
  });
  if (!process.env.CLOUDFLARE_AI_GATEWAY_ID?.trim()) {
    process.env.CLOUDFLARE_AI_GATEWAY_ENABLED = 'false';
  }
  const mode = (arg('--mode') || '').toUpperCase();
  const configService = new ConfigService(process.env);
  const config = new AiApplicationConfigAdapter(configService);
  const llm = new CloudflareStructuredLlmAdapter(configService);
  const callLog = [];
  const generateObject = llm.generateObject.bind(llm);
  llm.generateObject = async (input) =>
    await generateObject({
      ...input,
      onDiagnostics: (diagnostics) => {
        callLog.push(diagnostics);
        input.onDiagnostics?.(diagnostics);
      },
    });
  const result =
    mode === 'ROUTER'
      ? await evaluateRouter(
          llm,
          config,
          arg('--model') || config.model('ROUTER'),
          callLog,
        )
      : mode === 'SUFFICIENCY'
        ? await evaluateSufficiency(llm, config, callLog)
        : mode === 'VERIFIER'
          ? await evaluateVerifier(llm, config, callLog)
          : (() => {
              throw new Error(
                '--mode must be ROUTER, SUFFICIENCY, or VERIFIER',
              );
            })();
  const output = arg('--output');
  if (output) fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  if (
    (mode === 'ROUTER' && !arg('--limit') && result.caseCount < 50) ||
    (mode !== 'ROUTER' && result.passed !== result.caseCount)
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
