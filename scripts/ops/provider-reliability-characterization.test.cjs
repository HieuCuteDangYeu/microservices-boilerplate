'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  PRODUCTION_ROLES,
  compareRuntimeConfig,
  loadRuntimeSnapshot,
  runCharacterization,
  sanitizeDiagnostics,
} = require('./provider-reliability-characterization.cjs');

const PRODUCTION_SHA = '28f02b2ee30d39821c29bfe90f8baffa1afe3de4';

function snapshot() {
  return {
    schemaVersion: 'provider-diagnostic-runtime-v1',
    gitSha: PRODUCTION_SHA,
    productionSha: PRODUCTION_SHA,
    provenance: 'OPERATOR_OBSERVED_DEPLOYMENT_RUNTIME',
    runtimeConfigSource:
      'ssh velora-homelab /home/quan/apps/microservices-boilerplate',
    structuredReasoningEffort: 'low',
    routerOutputContract: 'CHAT_JSON_SCHEMA',
    structuredMaxTokensParameter: 'max_completion_tokens',
    gatewayPolicy: {
      enabled: true,
      maxAttempts: 1,
      retryDelayMs: 250,
      backoff: 'exponential',
    },
    roles: {
      ROUTER: {
        model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
        timeoutMs: 30000,
        maxCompletionTokens: 512,
      },
      RETRIEVAL_PLANNER: {
        model: '@cf/openai/gpt-oss-20b',
        timeoutMs: 8000,
        maxCompletionTokens: 512,
      },
      VERIFIER: {
        model: '@cf/openai/gpt-oss-20b',
        timeoutMs: 12000,
        maxCompletionTokens: 650,
      },
      CITATION_ATTRIBUTION: {
        model: '@cf/openai/gpt-oss-20b',
        timeoutMs: 12000,
        maxCompletionTokens: 768,
      },
    },
  };
}

function environment() {
  return {
    AI_ROUTER_MODEL: snapshot().roles.ROUTER.model,
    AI_ROUTER_TIMEOUT_MS: '30000',
    AI_ROUTER_MAX_TOKENS: '512',
    AI_RETRIEVAL_PLANNER_MODEL: snapshot().roles.RETRIEVAL_PLANNER.model,
    AI_RETRIEVAL_PLANNER_TIMEOUT_MS: '8000',
    AI_VERIFIER_MODEL: snapshot().roles.VERIFIER.model,
    AI_VERIFIER_TIMEOUT_MS: '12000',
    AI_VERIFIER_MAX_TOKENS: '650',
    AI_CITATION_ATTRIBUTION_MODEL: snapshot().roles.CITATION_ATTRIBUTION.model,
    AI_CITATION_TIMEOUT_MS: '12000',
    CLOUDFLARE_AI_GATEWAY_ENABLED: 'true',
    CLOUDFLARE_STRUCTURED_REASONING_EFFORT: 'low',
    CLOUDFLARE_ROUTER_OUTPUT_CONTRACT: 'CHAT_JSON_SCHEMA',
  };
}

test('wrong Router model fails closed before any provider invocation', async () => {
  const actual = environment();
  actual.AI_ROUTER_MODEL = '@cf/zai-org/glm-4.7-flash';
  const comparison = compareRuntimeConfig(snapshot(), actual);
  let providerCalls = 0;
  const result = await runCharacterization({
    snapshot: snapshot(),
    comparison,
    callsPerRole: 1,
    capacityGate: 'PASS',
    confirmProviderCalls: true,
    adapter: {
      generateObject: async () => {
        providerCalls += 1;
      },
    },
  });
  assert.equal(comparison.configMatch, false);
  assert.equal(comparison.roles.ROUTER.modelMatch, false);
  assert.equal(result.providerCalls, 0);
  assert.equal(providerCalls, 0);
});

test('matching production snapshot permits only mocked, predeclared calls', async () => {
  const expected = snapshot();
  const actual = environment();
  const comparison = compareRuntimeConfig(expected, actual);
  const requests = [];
  const result = await runCharacterization({
    snapshot: expected,
    comparison,
    callsPerRole: 1,
    capacityGate: 'PASS',
    confirmProviderCalls: true,
    adapter: {
      generateObject: async (request) => {
        requests.push(request);
        request.onDiagnostics({
          modelRole: request.modelRole,
          model: request.model,
          providerStatus: 200,
          latencyMs: 1,
          configuredTimeoutMs: request.timeoutMs,
          configuredMaxCompletionTokens: request.maxTokens,
          attempt: 1,
        });
        return {};
      },
    },
  });
  assert.equal(comparison.configMatch, true);
  assert.equal(result.providerCalls, PRODUCTION_ROLES.length);
  assert.deepEqual(
    requests.map((request) => request.model),
    PRODUCTION_ROLES.map((role) => expected.roles[role].model),
  );
});

test('missing snapshot fails before provider invocation', async () => {
  assert.throws(
    () => loadRuntimeSnapshot(undefined, PRODUCTION_SHA),
    /runtime config snapshot is required/,
  );
  let providerCalls = 0;
  const result = await runCharacterization({
    snapshot: null,
    comparison: null,
    callsPerRole: 1,
    capacityGate: 'PASS',
    confirmProviderCalls: true,
    adapter: {
      generateObject: async () => {
        providerCalls += 1;
      },
    },
  });
  assert.equal(result.providerCalls, 0);
  assert.equal(providerCalls, 0);
});

test('runtime snapshot loader rejects an attestation without observed provenance', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'velora-provider-'));
  const file = path.join(directory, 'snapshot.json');
  const value = snapshot();
  value.provenance = 'OPERATOR_SUPPLIED_DEPLOYMENT_SNAPSHOT';
  fs.writeFileSync(file, JSON.stringify(value));
  assert.throws(
    () => loadRuntimeSnapshot(file, PRODUCTION_SHA),
    /provenance is not observed/,
  );
});

test('diagnostic persistence removes provider request IDs', () => {
  const sanitized = sanitizeDiagnostics({
    model: '@cf/openai/gpt-oss-20b',
    providerStatus: 200,
    requestId: 'cf-ray-must-not-persist',
  });
  assert.equal(sanitized.requestId, undefined);
  assert.equal(sanitized.providerStatus, 200);
});

test('provider budget must be explicit and bounded', async () => {
  const expected = snapshot();
  const comparison = compareRuntimeConfig(expected, environment());
  let providerCalls = 0;
  await assert.rejects(
    runCharacterization({
      snapshot: expected,
      comparison,
      capacityGate: 'PASS',
      confirmProviderCalls: true,
      adapter: {
        generateObject: async () => {
          providerCalls += 1;
        },
      },
    }),
    /calls-per-role must be an integer/,
  );
  assert.equal(providerCalls, 0);
});
