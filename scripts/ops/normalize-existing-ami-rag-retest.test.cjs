'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  collectModelCalls,
  normalizeCase,
} = require('./normalize-existing-ami-rag-retest.cjs');

test('normalizes a completed runner case without scoring it', () => {
  const value = normalizeCase(
    {
      caseId: 'C-1',
      question: 'Question?',
      referenceAnswerText: 'Answer.',
      reelId: 'r1',
      expectedEvidenceType: 'TRANSCRIPT',
    },
    {
      status: 'EVALUATED',
      finalAnswer: 'Answer.',
      latencyMs: 42,
      citations: [],
    },
    {
      intent: 'REEL_VIDEO_QUESTION',
      retrievedChunkIds: ['r1:e1'],
      workflowMetrics: { diagnostics: {} },
    },
    'run-1',
  );
  assert.equal(value.schemaVersion, 'rag-eval-result-v1');
  assert.equal(value.executionStatus, 'COMPLETED');
  assert.equal(value.actual.answer, 'Answer.');
  assert.equal(Object.hasOwn(value, 'score'), false);
});

test('labels provider usage source and scopes from diagnostics', () => {
  const calls = collectModelCalls({
    nested: {
      modelRole: 'router',
      model: '@cf/openai/gpt-oss-20b',
      inputTokens: 10,
      outputTokens: 2,
      usageSource: 'PROVIDER',
      providerStatus: 200,
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].modelRole, 'router');
  assert.equal(calls[0].usageSource, 'PROVIDER');
  assert.equal(calls[0].scope, 'QUERY');
});
