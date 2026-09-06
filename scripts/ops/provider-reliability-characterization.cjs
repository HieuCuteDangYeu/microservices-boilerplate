#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ConfigService } = require('@nestjs/config');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '../..');
const PRODUCTION_ROLES = [
  'ROUTER',
  'RETRIEVAL_PLANNER',
  'VERIFIER',
  'CITATION_ATTRIBUTION',
];
const MAX_CALLS_PER_ROLE = 10;

const ROLE_ENV = {
  ROUTER: {
    model: 'AI_ROUTER_MODEL',
    timeout: 'AI_ROUTER_TIMEOUT_MS',
    maxTokens: 'AI_ROUTER_MAX_TOKENS',
    timeoutDefault: 8_000,
    maxTokensDefault: 2_048,
  },
  RETRIEVAL_PLANNER: {
    model: 'AI_RETRIEVAL_PLANNER_MODEL',
    timeout: 'AI_RETRIEVAL_PLANNER_TIMEOUT_MS',
    maxTokens: 'AI_RETRIEVAL_PLANNER_MAX_TOKENS',
    timeoutDefault: 8_000,
    maxTokensDefault: 512,
  },
  VERIFIER: {
    model: 'AI_VERIFIER_MODEL',
    timeout: 'AI_VERIFIER_TIMEOUT_MS',
    maxTokens: 'AI_VERIFIER_MAX_TOKENS',
    timeoutDefault: 8_000,
    maxTokensDefault: 650,
  },
  CITATION_ATTRIBUTION: {
    model: 'AI_CITATION_ATTRIBUTION_MODEL',
    timeout: 'AI_CITATION_TIMEOUT_MS',
    maxTokens: 'AI_CITATION_MAX_TOKENS',
    timeoutDefault: 8_000,
    maxTokensDefault: 768,
  },
};

const ROLE_PROMPTS = {
  ROUTER: {
    system:
      'Return only JSON matching the routing object. This is a synthetic provider diagnostic; do not answer the user.',
    user: 'Classify this synthetic message as normal chat: Hello from a provider reliability check.',
  },
  RETRIEVAL_PLANNER: {
    system:
      'Return only JSON matching the retrieval planner object. This is a synthetic provider diagnostic.',
    user: 'Rewrite this synthetic search request as one concise query: blue beacon in the synthetic reel.',
  },
  VERIFIER: {
    system:
      'Return only JSON matching the verifier object. Use only the synthetic evidence IDs and do not expose reasoning.',
    user: JSON.stringify({
      question: 'What color is the synthetic beacon?',
      answer: 'The synthetic beacon is blue.',
      proposedClaims: ['The synthetic beacon is blue.'],
      evidence: [
        { evidenceId: 'synthetic-e0', evidenceText: 'The beacon is blue.' },
      ],
    }),
  },
  CITATION_ATTRIBUTION: {
    system:
      'Return only JSON matching the citation attribution object. Use only the synthetic evidence IDs and do not expose reasoning.',
    user: JSON.stringify({
      question: 'What color is the synthetic beacon?',
      answer: 'The synthetic beacon is blue.',
      proposedClaims: [
        {
          claim: 'The synthetic beacon is blue.',
          evidenceIds: ['synthetic-e0'],
        },
      ],
      candidates: [{ evidenceId: 'synthetic-e0', text: 'The beacon is blue.' }],
    }),
  },
};

const SCHEMAS = {
  ROUTER: {
    type: 'object',
    properties: {
      intent: { type: 'string' },
      needsRetrieval: { type: 'boolean' },
      needsUserMemory: { type: 'boolean' },
      needsConversationSummary: { type: 'boolean' },
      needsVerification: { type: 'boolean' },
      reelQuestionType: { type: 'string' },
      requiredEvidence: { type: 'array', items: { type: 'string' } },
      recommendationAction: { type: 'object' },
      reason: { type: 'string' },
    },
    required: [
      'intent',
      'needsRetrieval',
      'needsUserMemory',
      'needsConversationSummary',
      'needsVerification',
      'reelQuestionType',
      'requiredEvidence',
      'recommendationAction',
      'reason',
    ],
    additionalProperties: false,
  },
  RETRIEVAL_PLANNER: {
    type: 'object',
    properties: { query: { type: 'string', maxLength: 500 } },
    required: ['query'],
    additionalProperties: false,
  },
  VERIFIER: {
    type: 'object',
    properties: {
      passed: { type: 'boolean' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      issues: { type: 'array', items: { type: 'string' } },
      requiresRevision: { type: 'boolean' },
      revisedInstruction: { type: 'string' },
      contradictions: { type: 'array', items: { type: 'string' } },
      supportedClaimMappings: { type: 'array', items: { type: 'object' } },
    },
    required: [
      'passed',
      'confidence',
      'issues',
      'requiresRevision',
      'revisedInstruction',
      'contradictions',
      'supportedClaimMappings',
    ],
    additionalProperties: false,
  },
  CITATION_ATTRIBUTION: {
    type: 'object',
    properties: { claims: { type: 'array', items: { type: 'object' } } },
    required: ['claims'],
    additionalProperties: false,
  },
};

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolvePath(filePath), 'utf8'));
}

function loadRuntimeSnapshot(filePath, productionSha) {
  if (!filePath) throw new Error('runtime config snapshot is required');
  const snapshot = readJson(filePath);
  if (snapshot.provenance !== 'OPERATOR_OBSERVED_DEPLOYMENT_RUNTIME')
    throw new Error(
      'runtime config snapshot provenance is not observed deployment runtime',
    );
  const snapshotSha = snapshot.gitSha ?? snapshot.productionSha;
  if (!productionSha || snapshotSha !== productionSha)
    throw new Error(
      'runtime config snapshot gitSha must match explicit production SHA',
    );
  if (snapshot.productionSha && snapshot.productionSha !== snapshotSha)
    throw new Error(
      'runtime config snapshot productionSha does not match gitSha',
    );
  if (!snapshot.roles || typeof snapshot.roles !== 'object')
    throw new Error('runtime config snapshot roles are required');
  for (const role of PRODUCTION_ROLES) {
    const value = snapshot.roles[role];
    if (
      !value ||
      typeof value.model !== 'string' ||
      !Number.isInteger(value.timeoutMs) ||
      !Number.isInteger(value.maxCompletionTokens)
    ) {
      throw new Error(`runtime config snapshot is incomplete for ${role}`);
    }
  }
  const gateway = snapshot.gatewayPolicy;
  if (
    !gateway ||
    typeof gateway.enabled !== 'boolean' ||
    !Number.isInteger(gateway.maxAttempts) ||
    !Number.isInteger(gateway.retryDelayMs) ||
    !['constant', 'linear', 'exponential'].includes(gateway.backoff)
  ) {
    throw new Error('runtime config snapshot gateway policy is incomplete');
  }
  if (
    snapshot.aiGatewayEnabled !== undefined &&
    snapshot.aiGatewayEnabled !== gateway.enabled
  )
    throw new Error('runtime config snapshot gateway fields conflict');
  if (
    snapshot.routerPrimaryModel !== undefined &&
    snapshot.routerPrimaryModel !== snapshot.roles.ROUTER.model
  )
    throw new Error('runtime config snapshot Router fields conflict');
  if (
    snapshot.routerTimeoutMs !== undefined &&
    snapshot.routerTimeoutMs !== snapshot.roles.ROUTER.timeoutMs
  )
    throw new Error('runtime config snapshot Router timeout fields conflict');
  if (
    snapshot.routerMaxCompletionTokens !== undefined &&
    snapshot.routerMaxCompletionTokens !==
      snapshot.roles.ROUTER.maxCompletionTokens
  )
    throw new Error('runtime config snapshot Router token fields conflict');
  for (const key of [
    'structuredReasoningEffort',
    'routerOutputContract',
    'structuredMaxTokensParameter',
  ]) {
    if (typeof snapshot[key] !== 'string' || !snapshot[key])
      throw new Error(`runtime config snapshot ${key} is required`);
  }
  return { ...snapshot, gitSha: snapshotSha };
}

function loadEnvironment(envFile) {
  const parsed = envFile
    ? dotenv.parse(fs.readFileSync(resolvePath(envFile), 'utf8'))
    : {};
  return { ...parsed, ...process.env };
}

function effectiveNumber(environment, key, fallback) {
  if (environment[key] === undefined || environment[key] === '')
    return fallback;
  const value = Number(environment[key]);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function effectiveBoolean(environment, key, fallback) {
  const value = String(environment[key] ?? '')
    .trim()
    .toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function effectiveString(environment, key, fallback) {
  const value = String(environment[key] ?? '').trim();
  return value || fallback;
}

function diagnosticRoleConfig(environment, role) {
  const keys = ROLE_ENV[role];
  return {
    model: String(environment[keys.model] ?? '').trim() || null,
    timeoutMs: effectiveNumber(environment, keys.timeout, keys.timeoutDefault),
    maxCompletionTokens: effectiveNumber(
      environment,
      keys.maxTokens,
      keys.maxTokensDefault,
    ),
  };
}

function compareRuntimeConfig(snapshot, environment) {
  const roles = {};
  for (const role of PRODUCTION_ROLES) {
    const expected = snapshot.roles[role];
    const diagnostic = diagnosticRoleConfig(environment, role);
    roles[role] = {
      expected: {
        model: expected.model,
        timeoutMs: expected.timeoutMs,
        maxCompletionTokens: expected.maxCompletionTokens,
      },
      diagnostic,
      modelMatch: diagnostic.model === expected.model,
      timeoutMatch: diagnostic.timeoutMs === expected.timeoutMs,
      maxTokensMatch:
        diagnostic.maxCompletionTokens === expected.maxCompletionTokens,
    };
    roles[role].match =
      roles[role].modelMatch &&
      roles[role].timeoutMatch &&
      roles[role].maxTokensMatch;
  }

  const expectedGateway = snapshot.gatewayPolicy;
  const diagnosticGateway = {
    enabled: effectiveBoolean(
      environment,
      'CLOUDFLARE_AI_GATEWAY_ENABLED',
      true,
    ),
    maxAttempts: effectiveNumber(
      environment,
      'CLOUDFLARE_AI_GATEWAY_MAX_ATTEMPTS',
      1,
    ),
    retryDelayMs: effectiveNumber(
      environment,
      'CLOUDFLARE_AI_GATEWAY_RETRY_DELAY_MS',
      250,
    ),
    backoff: effectiveString(
      environment,
      'CLOUDFLARE_AI_GATEWAY_BACKOFF',
      'exponential',
    ).toLowerCase(),
  };
  const gatewayMatch =
    expectedGateway.enabled === diagnosticGateway.enabled &&
    expectedGateway.maxAttempts === diagnosticGateway.maxAttempts &&
    expectedGateway.retryDelayMs === diagnosticGateway.retryDelayMs &&
    expectedGateway.backoff === diagnosticGateway.backoff;

  const diagnosticPolicy = {
    structuredReasoningEffort: effectiveString(
      environment,
      'CLOUDFLARE_STRUCTURED_REASONING_EFFORT',
      '',
    ).toLowerCase(),
    routerOutputContract: effectiveString(
      environment,
      'CLOUDFLARE_ROUTER_OUTPUT_CONTRACT',
      'CHAT_JSON_SCHEMA',
    ),
    structuredMaxTokensParameter: effectiveString(
      environment,
      'CLOUDFLARE_STRUCTURED_MAX_TOKENS_PARAMETER',
      'max_completion_tokens',
    ).toLowerCase(),
  };
  const policyMatch =
    diagnosticPolicy.structuredReasoningEffort ===
      snapshot.structuredReasoningEffort &&
    diagnosticPolicy.routerOutputContract === snapshot.routerOutputContract &&
    diagnosticPolicy.structuredMaxTokensParameter ===
      snapshot.structuredMaxTokensParameter;

  return {
    roles,
    expectedGateway,
    diagnosticGateway,
    gatewayMatch,
    expectedPolicy: {
      structuredReasoningEffort: snapshot.structuredReasoningEffort,
      routerOutputContract: snapshot.routerOutputContract,
      structuredMaxTokensParameter: snapshot.structuredMaxTokensParameter,
    },
    diagnosticPolicy,
    policyMatch,
    configMatch:
      gatewayMatch &&
      policyMatch &&
      PRODUCTION_ROLES.every((role) => roles[role].match),
  };
}

function precheckLines(snapshot, comparison, diagnosticToolSha) {
  const lines = [
    'PROVIDER_DIAGNOSTIC_CONFIG_PRECHECK',
    `PRODUCTION_SHA=${snapshot.gitSha}`,
    `DIAGNOSTIC_TOOL_SHA=${diagnosticToolSha}`,
    `PRODUCTION_CONFIG_SOURCE=${snapshot.runtimeConfigSource ?? 'UNSPECIFIED'}`,
    `PRODUCTION_CONFIG_PROVENANCE=${snapshot.provenance}`,
  ];
  for (const role of PRODUCTION_ROLES) {
    const label =
      role === 'RETRIEVAL_PLANNER'
        ? 'PLANNER'
        : role.replace('_ATTRIBUTION', '');
    const value = comparison.roles[role];
    lines.push(
      `${label}_EXPECTED_MODEL=${value.expected.model}`,
      `${label}_DIAGNOSTIC_MODEL=${value.diagnostic.model ?? '<MISSING>'}`,
      `${label}_MODEL_MATCH=${value.modelMatch ? 'YES' : 'NO'}`,
      `${label}_EXPECTED_TIMEOUT_MS=${value.expected.timeoutMs}`,
      `${label}_DIAGNOSTIC_TIMEOUT_MS=${value.diagnostic.timeoutMs ?? '<INVALID>'}`,
      `${label}_TIMEOUT_MATCH=${value.timeoutMatch ? 'YES' : 'NO'}`,
      `${label}_EXPECTED_MAX_TOKENS=${value.expected.maxCompletionTokens}`,
      `${label}_DIAGNOSTIC_MAX_TOKENS=${value.diagnostic.maxCompletionTokens ?? '<INVALID>'}`,
      `${label}_TOKEN_BUDGET_MATCH=${value.maxTokensMatch ? 'YES' : 'NO'}`,
    );
  }
  lines.push(
    `TIMEOUTS_MATCH=${PRODUCTION_ROLES.every((role) => comparison.roles[role].timeoutMatch) ? 'YES' : 'NO'}`,
    `TOKEN_BUDGETS_MATCH=${PRODUCTION_ROLES.every((role) => comparison.roles[role].maxTokensMatch) ? 'YES' : 'NO'}`,
    `GATEWAY_POLICY_MATCH=${comparison.gatewayMatch && comparison.policyMatch ? 'YES' : 'NO'}`,
    `LOCAL_ENV_ROLE_FALLBACK_DISABLED=YES`,
    `CONFIG_MATCH=${comparison.configMatch ? 'YES' : 'NO'}`,
  );
  return lines;
}

function sanitizeDiagnostics(diagnostics) {
  const safe = { ...diagnostics };
  delete safe.requestId;
  return safe;
}

function buildAdapterConfig(snapshot, environment) {
  const configValues = {
    ...environment,
    CLOUDFLARE_AI_GATEWAY_ENABLED: String(snapshot.gatewayPolicy.enabled),
    CLOUDFLARE_AI_GATEWAY_MAX_ATTEMPTS: String(
      snapshot.gatewayPolicy.maxAttempts,
    ),
    CLOUDFLARE_AI_GATEWAY_RETRY_DELAY_MS: String(
      snapshot.gatewayPolicy.retryDelayMs,
    ),
    CLOUDFLARE_AI_GATEWAY_BACKOFF: snapshot.gatewayPolicy.backoff,
    CLOUDFLARE_STRUCTURED_REASONING_EFFORT: snapshot.structuredReasoningEffort,
    CLOUDFLARE_ROUTER_OUTPUT_CONTRACT: snapshot.routerOutputContract,
    CLOUDFLARE_STRUCTURED_MAX_TOKENS_PARAMETER:
      snapshot.structuredMaxTokensParameter,
  };
  const config = new ConfigService(configValues);
  config.skipProcessEnv = true;
  return config;
}

function requestForRole(snapshot, role, onDiagnostics) {
  const config = snapshot.roles[role];
  return {
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxTokens: config.maxCompletionTokens,
    modelRole: role,
    systemPrompt: ROLE_PROMPTS[role].system,
    userPrompt: ROLE_PROMPTS[role].user,
    jsonSchema: SCHEMAS[role],
    temperature: 0,
    attempt: 1,
    onDiagnostics,
  };
}

function validateCallArgs({
  callsPerRole,
  capacityGate,
  confirmProviderCalls,
}) {
  if (!confirmProviderCalls) return;
  if (capacityGate !== 'PASS')
    throw new Error(
      'provider characterization requires ACCOUNT_CAPACITY_GATE=PASS',
    );
  const value = Number(callsPerRole);
  if (!Number.isInteger(value) || value < 1 || value > MAX_CALLS_PER_ROLE)
    throw new Error(
      `calls-per-role must be an integer from 1 to ${MAX_CALLS_PER_ROLE}`,
    );
}

async function runCharacterization({
  snapshot,
  comparison,
  callsPerRole,
  capacityGate,
  confirmProviderCalls,
  adapter,
}) {
  if (!snapshot || !comparison?.configMatch) {
    return { providerCalls: 0, stoppedReason: 'CONFIG_MISMATCH' };
  }
  validateCallArgs({ callsPerRole, capacityGate, confirmProviderCalls });
  if (!confirmProviderCalls)
    return { providerCalls: 0, stoppedReason: 'PRECHECK_ONLY' };

  const records = [];
  const expectedCalls = PRODUCTION_ROLES.length * Number(callsPerRole);
  let stoppedReason = 'COMPLETED_PREDECLARED_SAMPLE';
  for (const role of PRODUCTION_ROLES) {
    for (let index = 0; index < Number(callsPerRole); index += 1) {
      const diagnostics = [];
      const startedAt = Date.now();
      let outcome = 'SUCCESS';
      try {
        await adapter.generateObject(
          requestForRole(snapshot, role, (value) =>
            diagnostics.push(sanitizeDiagnostics(value)),
          ),
        );
      } catch {
        outcome = 'FAILURE';
      }
      const call = {
        sequence: records.length + 1,
        role,
        sampleIndex: index + 1,
        outcome,
        elapsedMs: Date.now() - startedAt,
        diagnostics: diagnostics[0] ?? null,
      };
      records.push(call);
      if (call.diagnostics?.providerCategory === 'ACCOUNT_LIMITED') {
        stoppedReason = 'ACCOUNT_LIMITED';
        return {
          providerCalls: records.length,
          expectedCalls,
          stoppedReason,
          records,
        };
      }
    }
  }
  return {
    providerCalls: records.length,
    expectedCalls,
    stoppedReason,
    records,
    environmentUsedForCredentialsOnly: true,
  };
}

function currentGitSha() {
  if (process.env.DIAGNOSTIC_TOOL_SHA?.trim())
    return process.env.DIAGNOSTIC_TOOL_SHA.trim();
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'UNAVAILABLE_IN_RESTRICTED_RUNNER';
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const productionSha = args.production_sha;
  const snapshot = loadRuntimeSnapshot(
    args.runtime_config_snapshot,
    productionSha,
  );
  const environment = loadEnvironment(args.diagnostic_env_file);
  const comparison = compareRuntimeConfig(snapshot, environment);
  for (const line of precheckLines(snapshot, comparison, currentGitSha()))
    console.log(line);
  if (!comparison.configMatch) {
    console.log('PROVIDER_CALLS=0');
    process.exitCode = 2;
    return;
  }

  const adapter =
    args.confirm_provider_calls === true
      ? new (require(
          path.join(
            ROOT,
            'dist/apps/ai-service/apps/ai-service/src/infrastructure/adapters/cloudflare-structured-llm.adapter.js',
          ),
        ).CloudflareStructuredLlmAdapter)(
          buildAdapterConfig(snapshot, environment),
        )
      : undefined;
  const result = await runCharacterization({
    snapshot,
    comparison,
    callsPerRole: args.calls_per_role,
    capacityGate: args.capacity_gate,
    confirmProviderCalls: args.confirm_provider_calls === true,
    adapter,
  });
  console.log(`PLANNED_TOTAL_PROVIDER_CALLS=${result.expectedCalls ?? 0}`);
  console.log(`PROVIDER_CALLS=${result.providerCalls}`);
  console.log(`STOPPED_REASON=${result.stoppedReason}`);
  if (args.output) {
    fs.writeFileSync(
      resolvePath(args.output),
      `${JSON.stringify(
        {
          schemaVersion: 'provider-reliability-characterization-v1',
          productionSha: snapshot.gitSha,
          diagnosticToolSha: currentGitSha(),
          configMatch: comparison.configMatch,
          plannedCallsPerRole: args.calls_per_role
            ? Number(args.calls_per_role)
            : null,
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
  PRODUCTION_ROLES,
  ROLE_ENV,
  compareRuntimeConfig,
  loadRuntimeSnapshot,
  runCharacterization,
  sanitizeDiagnostics,
};
