#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '../..');
const PRODUCTION_SHA = '28f02b2ee30d39821c29bfe90f8baffa1afe3de4';
const PLANNED_LOGICAL_REQUESTS = 10;
const MAX_PROVIDER_ATTEMPTS = 20;
const SYNTHETIC_REQUESTS = [
  'Say hello and explain what a cache is in one sentence.',
  'Give one concise tip for keeping a software project organized.',
  'What is the difference between a list and a set in programming?',
  'Write a short, friendly reminder to review a document tomorrow.',
  'Explain why tests are useful when changing a small function.',
  'Give one example of a reversible engineering change.',
  'Summarize the idea of measuring latency in one sentence.',
  'What does it mean for a configuration value to have a safe default?',
  'Answer with one sentence about why logs should avoid secrets.',
  'Describe a bounded retry in plain language without using code.',
];

const DIST = {
  applicationConfig: path.join(
    ROOT,
    'dist/apps/ai-service/apps/ai-service/src/infrastructure/adapters/ai-application-config.adapter.js',
  ),
  structuredLlm: path.join(
    ROOT,
    'dist/apps/ai-service/apps/ai-service/src/infrastructure/adapters/cloudflare-structured-llm.adapter.js',
  ),
  router: path.join(
    ROOT,
    'dist/apps/ai-service/apps/ai-service/src/application/use-cases/query-router-agent.use-case.js',
  ),
};

const {
  buildAdapterConfig,
  compareRuntimeConfig,
  loadRuntimeSnapshot,
} = require('./provider-reliability-characterization.cjs');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--'))
      throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2).replaceAll('-', '_');
    if (key === 'confirm_provider_calls') {
      args[key] = true;
      continue;
    }
    const value = argv[++index];
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for --${token.slice(2)}`);
    args[key] = value;
  }
  return args;
}

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
}

function loadEnvironment(envFile) {
  const parsed = envFile
    ? dotenv.parse(fs.readFileSync(resolvePath(envFile), 'utf8'))
    : {};
  return { ...parsed, ...process.env };
}

function effectivePrimaryAttempts(environment) {
  const value = Number(environment.AI_ROUTER_PRIMARY_MAX_ATTEMPTS ?? 1);
  if (!Number.isInteger(value) || value < 1 || value > 2) return null;
  return value;
}

function validateExperimentConfig(environment, expectedAttempts) {
  const actualAttempts = effectivePrimaryAttempts(environment);
  if (actualAttempts === null)
    throw new Error(
      'AI_ROUTER_PRIMARY_MAX_ATTEMPTS must be an integer from 1 through 2',
    );
  if (actualAttempts !== expectedAttempts)
    throw new Error(
      `AI_ROUTER_PRIMARY_MAX_ATTEMPTS mismatch: expected ${expectedAttempts}, got ${actualAttempts}`,
    );
  if (String(environment.AI_ROUTER_FALLBACK_MODEL ?? '').trim())
    throw new Error(
      'AI_ROUTER_FALLBACK_MODEL must remain empty for this characterization',
    );
  return actualAttempts;
}

function safeDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return null;
  const allowed = [
    'modelRole',
    'model',
    'attempt',
    'latencyMs',
    'configuredTimeoutMs',
    'configuredMaxCompletionTokens',
    'providerStatus',
    'providerCode',
    'providerCategory',
    'errorCode',
    'transient',
    'retryAfterMs',
    'networkErrorName',
    'networkErrorCode',
    'networkErrorSyscall',
    'finishReason',
    'schemaPath',
    'schemaConstraint',
    'usage',
  ];
  const safe = {};
  for (const key of allowed) {
    if (diagnostics[key] !== undefined) safe[key] = diagnostics[key];
  }
  return safe;
}

function safeError(error) {
  if (!error || typeof error !== 'object') return { code: 'UNKNOWN' };
  return {
    code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
    transient:
      typeof error.transient === 'boolean' ? error.transient : undefined,
  };
}

function isSuccessfulCall(call) {
  return (
    call &&
    typeof call === 'object' &&
    typeof call.providerStatus === 'number' &&
    call.providerStatus >= 200 &&
    call.providerStatus < 300 &&
    !call.errorCode
  );
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function classifyRecords(records) {
  const calls = records.flatMap((record) => record.calls);
  const firstCalls = records.map((record) => record.calls[0]).filter(Boolean);
  const retryCalls = calls.filter((call) => call.attempt === 2);
  return {
    logicalRequests: records.length,
    providerAttempts: calls.length,
    firstAttemptSuccesses: firstCalls.filter(isSuccessfulCall).length,
    transientFirstAttemptFailures: firstCalls.filter(
      (call) =>
        call.errorCode === 'STRUCTURED_COMPLETION_PROVIDER_ERROR' &&
        call.transient === true,
    ).length,
    retryAttempts: retryCalls.length,
    retrySuccesses: retryCalls.filter(isSuccessfulCall).length,
    retryFailures: retryCalls.filter((call) => !isSuccessfulCall(call)).length,
    unknownFailures: firstCalls.filter(
      (call) =>
        !isSuccessfulCall(call) &&
        call.errorCode === 'STRUCTURED_COMPLETION_PROVIDER_ERROR' &&
        call.transient === undefined,
    ).length,
    nonTransientFailures: firstCalls.filter(
      (call) =>
        !isSuccessfulCall(call) &&
        (call.transient === false ||
          call.providerCategory === 'ACCOUNT_LIMITED'),
    ).length,
    logicalLatencyMs: records.map((record) => record.latencyMs),
    providerAttemptLatencyMs: calls
      .map((call) => call.latencyMs)
      .filter((value) => Number.isFinite(value)),
  };
}

function buildSummary(records, stoppedReason) {
  const classified = classifyRecords(records);
  const logicalLatencyMs = classified.logicalLatencyMs;
  const providerAttemptLatencyMs = classified.providerAttemptLatencyMs;
  return {
    ...classified,
    stoppedReason,
    retryPathExercised: classified.retryAttempts > 0,
    logicalP50Ms: percentile(logicalLatencyMs, 0.5),
    logicalP95Ms: percentile(logicalLatencyMs, 0.95),
    logicalMaxMs: Math.max(...logicalLatencyMs, 0),
    providerAttemptP50Ms: percentile(providerAttemptLatencyMs, 0.5),
    providerAttemptP95Ms: percentile(providerAttemptLatencyMs, 0.95),
    providerAttemptMaxMs: Math.max(...providerAttemptLatencyMs, 0),
  };
}

async function runCharacterization({
  snapshot,
  comparison,
  environment,
  expectedAttempts,
  confirmProviderCalls,
}) {
  if (!comparison.configMatch) {
    return { providerCalls: 0, stoppedReason: 'CONFIG_MISMATCH' };
  }
  validateExperimentConfig(environment, expectedAttempts);
  if (!confirmProviderCalls)
    return { providerCalls: 0, stoppedReason: 'PRECHECK_ONLY' };

  if (SYNTHETIC_REQUESTS.length !== PLANNED_LOGICAL_REQUESTS)
    throw new Error(
      'synthetic request plan does not match the declared sample size',
    );
  for (const filePath of Object.values(DIST)) {
    if (!fs.existsSync(filePath))
      throw new Error(`compiled evaluator module missing: ${filePath}`);
  }

  const { AiApplicationConfigAdapter } = require(DIST.applicationConfig);
  const { CloudflareStructuredLlmAdapter } = require(DIST.structuredLlm);
  const { QueryRouterAgentUseCase } = require(DIST.router);
  const configService = buildAdapterConfig(snapshot, environment);
  configService.skipProcessEnv = true;
  const applicationConfig = new AiApplicationConfigAdapter(configService);
  const structuredLlm = new CloudflareStructuredLlmAdapter(configService);
  const router = new QueryRouterAgentUseCase(structuredLlm, applicationConfig);

  const records = [];
  let stoppedReason = 'COMPLETED_PREDECLARED_SAMPLE';
  for (let index = 0; index < SYNTHETIC_REQUESTS.length; index += 1) {
    const startedAt = Date.now();
    let result;
    let failure;
    try {
      result = await router.execute({
        message: SYNTHETIC_REQUESTS[index],
        hasSharedReelContext: false,
      });
    } catch (error) {
      failure = error;
    }
    const rawCalls =
      result?.diagnostics?.semanticCalls ?? failure?.semanticCalls ?? [];
    const calls = rawCalls.map(safeDiagnostics).filter(Boolean);
    const record = {
      logicalRequest: index + 1,
      outcome: failure ? 'FAILURE' : 'SUCCESS',
      latencyMs: Date.now() - startedAt,
      calls,
      error: failure ? safeError(failure) : undefined,
    };
    records.push(record);
    if (
      records.reduce((total, item) => total + item.calls.length, 0) >
      MAX_PROVIDER_ATTEMPTS
    )
      throw new Error('provider attempt cap exceeded');
    if (calls.some((call) => call.providerCategory === 'ACCOUNT_LIMITED')) {
      stoppedReason = 'ACCOUNT_LIMITED';
      break;
    }
  }

  const summary = buildSummary(records, stoppedReason);
  return {
    providerCalls: summary.providerAttempts,
    expectedLogicalRequests: PLANNED_LOGICAL_REQUESTS,
    maxProviderAttempts: MAX_PROVIDER_ATTEMPTS,
    stoppedReason,
    summary,
    records,
  };
}

function currentEvaluatorSha() {
  return String(process.env.DIAGNOSTIC_TOOL_SHA ?? 'UNAVAILABLE').trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const productionSha = args.production_sha ?? PRODUCTION_SHA;
  const expectedAttempts = Number(args.primary_max_attempts ?? 2);
  if (expectedAttempts !== 2)
    throw new Error(
      'this characterization is predeclared for AI_ROUTER_PRIMARY_MAX_ATTEMPTS=2',
    );
  const snapshot = loadRuntimeSnapshot(
    args.runtime_config_snapshot,
    productionSha,
  );
  const environment = loadEnvironment(args.diagnostic_env_file);
  const comparison = compareRuntimeConfig(snapshot, environment);
  const fallbackEmpty = !String(
    environment.AI_ROUTER_FALLBACK_MODEL ?? '',
  ).trim();
  const attemptsValid =
    effectivePrimaryAttempts(environment) === expectedAttempts;
  console.log('ROUTER_RETRY_CHARACTERIZATION_PRECHECK');
  console.log(`PRODUCTION_SHA=${snapshot.gitSha}`);
  console.log(`EVALUATOR_SHA=${currentEvaluatorSha()}`);
  console.log(
    `CONFIG_MATCH=${comparison.configMatch && fallbackEmpty && attemptsValid ? 'YES' : 'NO'}`,
  );
  console.log(
    `AI_ROUTER_PRIMARY_MAX_ATTEMPTS=${effectivePrimaryAttempts(environment) ?? 'INVALID'}`,
  );
  console.log(`AI_ROUTER_FALLBACK_MODEL_EMPTY=${fallbackEmpty ? 'YES' : 'NO'}`);
  if (!comparison.configMatch || !fallbackEmpty || !attemptsValid) {
    console.log('PROVIDER_CALLS=0');
    process.exitCode = 2;
    return;
  }

  const result = await runCharacterization({
    snapshot,
    comparison,
    environment,
    expectedAttempts,
    confirmProviderCalls: args.confirm_provider_calls === true,
  });
  console.log(`PLANNED_LOGICAL_REQUESTS=${PLANNED_LOGICAL_REQUESTS}`);
  console.log(
    `ACTUAL_LOGICAL_REQUESTS=${result.summary?.logicalRequests ?? 0}`,
  );
  console.log(`PROVIDER_CALLS=${result.providerCalls}`);
  console.log(`MAX_PROVIDER_ATTEMPTS=${MAX_PROVIDER_ATTEMPTS}`);
  console.log(`STOPPED_REASON=${result.stoppedReason}`);
  if (args.output) {
    fs.writeFileSync(
      resolvePath(args.output),
      `${JSON.stringify(
        {
          schemaVersion: 'router-bounded-retry-characterization-v1',
          productionSha: snapshot.gitSha,
          evaluatorSha: currentEvaluatorSha(),
          configMatch: comparison.configMatch,
          expectedPrimaryMaxAttempts: expectedAttempts,
          result,
        },
        null,
        2,
      )}\n`,
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FAIL_BEFORE_PROVIDER_CALL=${error.message}`);
    console.log('PROVIDER_CALLS=0');
    process.exitCode = 2;
  });
}

module.exports = {
  MAX_PROVIDER_ATTEMPTS,
  PLANNED_LOGICAL_REQUESTS,
  SYNTHETIC_REQUESTS,
  buildSummary,
  classifyRecords,
  effectivePrimaryAttempts,
  safeDiagnostics,
  validateExperimentConfig,
};
