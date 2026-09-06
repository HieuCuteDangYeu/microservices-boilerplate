'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSummary,
  selectCallDiagnostics,
} = require('./router-retry-characterization.cjs');

const accountLimitedCall = {
  modelRole: 'ROUTER',
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  attempt: 1,
  latencyMs: 100,
  configuredTimeoutMs: 30_000,
  configuredMaxCompletionTokens: 512,
  providerStatus: 429,
  providerCode: 4006,
  providerCategory: 'ACCOUNT_LIMITED',
  errorCode: 'STRUCTURED_COMPLETION_PROVIDER_ERROR',
  transient: false,
  requestId: 'must-not-be-persisted',
};

test('falls back to adapter-observed diagnostics when Router rethrows directly', () => {
  assert.deepEqual(
    selectCallDiagnostics(
      undefined,
      Object.assign(new Error('account limited'), {
        code: 'STRUCTURED_COMPLETION_PROVIDER_ERROR',
        transient: false,
      }),
      [accountLimitedCall],
    ),
    [accountLimitedCall],
  );
});

test('classifies an account-limited call as non-transient without a retry', () => {
  const summary = buildSummary(
    [
      {
        logicalRequest: 1,
        latencyMs: 100,
        calls: [accountLimitedCall],
      },
    ],
    'ACCOUNT_LIMITED',
  );

  assert.equal(summary.providerAttempts, 1);
  assert.equal(summary.nonTransientFailures, 1);
  assert.equal(summary.retryAttempts, 0);
  assert.equal(summary.retryPathExercised, false);
});
