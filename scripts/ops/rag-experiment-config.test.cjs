'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveExperiment } = require('./rag-experiment-config.cjs');
const {
  evaluateRouter,
  checkpointWriter,
  normalizeCalls,
} = require('./run-rag-control-plane-evaluation.cjs');
const {
  CloudflareStructuredLlmAdapter,
} = require('../../dist/apps/ai-service/apps/ai-service/src/infrastructure/adapters/cloudflare-structured-llm.adapter.js');
const options = {
  envFile: '.env.test.local',
  configFile: 'eval/rag/config/router-calibration-v1.json',
  mode: 'ROUTER',
  subset: 'harness',
};

test('locked GPT 2048 candidate is exact despite stale inherited configuration', () => {
  const { config, snapshot, caseIds } = resolveExperiment(
    {
      ...options,
      configFile: 'eval/rag/config/router-gpt2048-v3.json',
      subset: 'stress',
    },
    {
      AI_ROUTER_MODEL: 'stale-model',
      AI_ROUTER_FALLBACK_MODEL: 'stale-fallback',
      AI_ROUTER_TIMEOUT_MS: '8000',
      AI_ROUTER_MAX_TOKENS: '768',
      CLOUDFLARE_STRUCTURED_REASONING_EFFORT: 'high',
    },
  );
  assert.equal(config.model('ROUTER'), '@cf/openai/gpt-oss-20b');
  assert.equal(config.get('AI_ROUTER_FALLBACK_MODEL'), '');
  assert.equal(config.timeoutMs('ROUTER'), 45000);
  assert.equal(config.maxCompletionTokens('ROUTER'), 2048);
  assert.equal(snapshot.candidateRouterFallbackModel, null);
  assert.equal(snapshot.routerFallbackModel, null);
  assert.equal(snapshot.roleModel, '@cf/openai/gpt-oss-20b');
  assert.equal(snapshot.configuredTimeoutMs, 45000);
  assert.equal(snapshot.maxCompletionTokens, 2048);
  assert.equal(snapshot.structuredReasoningEffort, 'low');
  assert.equal(snapshot.aiGatewayEnabled, false);
  assert.equal(snapshot.aiGatewayMaxAttempts, 1);
  assert.equal(snapshot.overrides.stopOnTruncation, true);
  assert.equal(snapshot.calibrationReuseInFullComparison, false);
  assert.equal(caseIds.length, 12);
  assert.ok(
    Object.values(snapshot.valueSources).every(
      (source) => source === 'VERSIONED_CANDIDATE',
    ),
  );
});

test('locked router stops and checkpoints immediately after truncation', async () => {
  const { config, snapshot } = resolveExperiment(
    {
      ...options,
      configFile: 'eval/rag/config/router-gpt2048-v3.json',
      subset: 'stress',
    },
    {},
  );
  const calls = [];
  const llm = {
    async generateObject() {
      calls.push({
        errorCode: 'STRUCTURED_COMPLETION_TRUNCATED',
        providerStatus: 200,
      });
      throw Object.assign(new Error('Truncated'), {
        code: 'STRUCTURED_COMPLETION_TRUNCATED',
      });
    },
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-truncation-'));
  const output = path.join(directory, 'observations.json');
  const result = await evaluateRouter(
    llm,
    config,
    snapshot.roleModel,
    calls,
    checkpointWriter(output, 'ROUTER', snapshot.roleModel, snapshot),
    ['task-01', 'explicit-01'],
    true,
  );
  assert.equal(calls.length, 1);
  assert.equal(result.samples.length, 1);
  assert.equal(
    JSON.parse(fs.readFileSync(output)).stoppedReason,
    'STRUCTURED_COMPLETION_TRUNCATED',
  );
});

for (const timeoutMs of [8000, 20000, 45000, 60000]) {
  test(`explicit ${timeoutMs} timeout reaches router, HTTP abort timer, and diagnostics`, async (t) => {
    const { service, config, snapshot } = resolveExperiment(
      { ...options, timeoutMs },
      {
        AI_ROUTER_TIMEOUT_MS: '9999',
        CLOUDFLARE_API_TOKEN: 'test-token',
        CLOUDFLARE_ACCOUNT_ID: 'test-account',
      },
    );
    const llm = new CloudflareStructuredLlmAdapter(service);
    const calls = [];
    const timers = [];
    const realSetTimeout = global.setTimeout;
    t.mock.method(global, 'setTimeout', (fn, ms, ...args) => {
      timers.push(ms);
      return realSetTimeout(fn, ms, ...args);
    });
    t.mock.method(global, 'fetch', async (_url, request) => {
      const body = JSON.parse(request.body);
      assert.equal(body.max_completion_tokens, 2048);
      assert.equal(body.reasoning_effort, 'low');
      assert.equal(body.model, '@cf/openai/gpt-oss-20b');
      assert.ok(request.signal);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: 'REEL_VIDEO_QUESTION',
                  reason: 'Shared reel question',
                  recommendationAction: {
                    type: 'NONE',
                    query: '',
                    allowPersonalizedFallback: false,
                    suggestedQueries: [],
                  },
                  referenceTarget: 'SHARED_REEL',
                  reelQuestionType: 'TRANSCRIPT_CONTENT',
                  requiredEvidence: ['TRANSCRIPT'],
                }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
        }),
        { status: 200 },
      );
    });
    // Test credentials never leave this process: fetch is replaced above.
    const generate = llm.generateObject.bind(llm);
    llm.generateObject = (input) => {
      assert.equal(input.timeoutMs, timeoutMs);
      return generate({ ...input, onDiagnostics: (d) => calls.push(d) });
    };
    const result = await evaluateRouter(
      llm,
      config,
      snapshot.roleModel,
      calls,
      () => {},
      ['explicit-01'],
    );
    assert.equal(result.samples[0].success, true);
    assert.deepEqual(timers, [timeoutMs]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].configuredTimeoutMs, timeoutMs);
    assert.equal(snapshot.configuredTimeoutMs, timeoutMs);
    assert.equal(snapshot.valueSources.AI_ROUTER_TIMEOUT_MS, 'CLI_OVERRIDE');
    assert.equal(normalizeCalls(calls)[0].configuredTimeoutMs, timeoutMs);
  });
}

test('candidate and effective roles are separate; no secrets or global mutation', () => {
  const before = { ...process.env };
  const { config, snapshot, caseIds } = resolveExperiment(
    { ...options, model: '@cf/zai-org/glm-4.7-flash' },
    { SECRET_TOKEN: 'must-not-appear', AI_ROUTER_TIMEOUT_MS: '8000' },
  );
  assert.equal(snapshot.candidateRouterPrimaryModel, '@cf/openai/gpt-oss-20b');
  assert.equal(
    snapshot.candidateRouterFallbackModel,
    '@cf/zai-org/glm-4.7-flash',
  );
  assert.equal(snapshot.routerPrimaryModel, config.model('ROUTER'));
  assert.equal(snapshot.routerPrimaryModel, '@cf/zai-org/glm-4.7-flash');
  assert.equal(snapshot.routerFallbackModel, null);
  assert.equal(snapshot.routerTimeoutMs, 45000);
  assert.equal(snapshot.routerFallbackTimeoutMs, 60000);
  assert.equal(snapshot.overrides.routerFallbackDisabled, true);
  assert.equal(caseIds.length, 6);
  assert.ok(
    snapshot.gitSha.length === 40 && snapshot.datasetSha256.length === 64,
  );
  assert.ok(!JSON.stringify(snapshot).includes('must-not-appear'));
  assert.ok(
    JSON.stringify({ ...process.env }) === JSON.stringify(before),
    'Environment must remain unchanged',
  );
});

test('checkpoint preserves snapshot and account-limit result atomically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-checkpoint-'));
  const output = path.join(dir, 'observations.json');
  const checkpoint = checkpointWriter(output, 'ROUTER', 'test', {
    configuredTimeoutMs: 45000,
  });
  checkpoint([]);
  checkpoint([{ id: 'one', calls: [] }]);
  assert.equal(JSON.parse(fs.readFileSync(output)).caseCount, 1);
  checkpoint([
    { id: 'one', calls: [] },
    { id: 'two', calls: [{ providerCategory: 'ACCOUNT_LIMITED' }] },
  ]);
  const saved = JSON.parse(fs.readFileSync(output));
  assert.equal(saved.stoppedReason, 'ACCOUNT_LIMITED');
  assert.equal(saved.configSnapshot.configuredTimeoutMs, 45000);
  assert.equal(saved.caseCount, 2);
  assert.equal(fs.existsSync(`${output}.tmp`), false);
});

test('normalization persists only safe schema diagnostics through the checkpoint', () => {
  const secret = 'synthetic-private-output';
  const calls = normalizeCalls([
    {
      modelRole: 'ROUTER',
      model: 'test',
      errorCode: 'STRUCTURED_COMPLETION_SCHEMA_INVALID',
      schemaPath: '$.recommendationAction.type',
      schemaConstraint: 'enum',
      schemaVersion: 'router-semantic-v2',
      rejectedValue: secret,
      responseBody: secret,
    },
  ]);
  assert.equal(calls[0].schemaPath, '$.recommendationAction.type');
  assert.equal(calls[0].constraint, 'enum');
  assert.equal(calls[0].schemaVersion, 'router-semantic-v2');
  assert.ok(!JSON.stringify(calls).includes(secret));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-schema-'));
  const output = path.join(dir, 'observations.json');
  checkpointWriter(output, 'ROUTER', 'test', {})([{ id: 'generic', calls }]);
  assert.equal(
    JSON.parse(fs.readFileSync(output)).samples[0].calls[0].schemaConstraint,
    'enum',
  );
});

test('fallback timeout and model-specific output budget are explicit overrides', () => {
  const { snapshot } = resolveExperiment(
    {
      ...options,
      configFile: 'eval/rag/config/router-contract-v2.json',
      model: '@cf/zai-org/glm-4.7-flash',
      timeoutMs: 60000,
      maxTokens: 2048,
      subset: 'fallback-timeout',
    },
    {},
  );
  assert.equal(snapshot.configuredTimeoutMs, 60000);
  assert.equal(snapshot.maxCompletionTokens, 2048);
  assert.equal(snapshot.overrides.routerMaxCompletionTokens, 2048);
  assert.equal(snapshot.routerFallbackMaxCompletionTokens, 2048);
  assert.deepEqual(snapshot.caseIds, ['implicit-01', 'conversation-01']);
});
