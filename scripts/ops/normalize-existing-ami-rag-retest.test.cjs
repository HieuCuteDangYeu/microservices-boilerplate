'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  collectModelCalls,
  normalizeCase,
} = require('./normalize-existing-ami-rag-retest.cjs');

test('normalizes actual persisted route and citation provenance without fixture substitution', () => {
  const value = normalizeCase(
    {
      caseId: 'C-ROUTE',
      question: 'Question?',
      referenceAnswerText: 'Expected answer.',
      reelId: 'r1',
      expectedEvidenceType: 'TRANSCRIPT',
    },
    {
      status: 'EVALUATED',
      finalAnswer: 'Actual answer.',
      latencyMs: 42,
      citations: [
        {
          sourceType: 'REEL',
          reelId: 'r1',
          evidenceType: 'TRANSCRIPT',
        },
      ],
    },
    {
      traceId: 'trace-1',
      intent: 'NORMAL_CHAT',
      retrievedContexts: [
        {
          evidenceId: 'reel:r1:chunk:0',
          reelId: 'r1',
          evidenceType: 'TRANSCRIPT',
        },
      ],
      rerankedContexts: [
        {
          evidenceId: 'reel:r1:chunk:0',
          reelId: 'r1',
          evidenceType: 'TRANSCRIPT',
        },
      ],
      workflowMetrics: {
        citationEvidenceIds: ['reel:r1:chunk:0'],
        citationEvidenceMappings: [
          {
            citationIndex: 0,
            selectedEvidenceId: 'e0',
            evidenceId: 'reel:r1:chunk:0',
          },
        ],
        diagnostics: {
          route: { modelRole: 'ROUTER', providerStatus: 'SUCCESS' },
          routeDecision: {
            intent: 'REEL_VIDEO_QUESTION',
            referenceTarget: 'SHARED_REEL',
            reelQuestionType: 'TRANSCRIPT_CONTENT',
            requiredEvidence: ['TRANSCRIPT'],
            needsRetrieval: true,
            needsVerification: true,
            recommendationActionType: 'NONE',
          },
        },
      },
    },
    'run-route',
  );
  assert.deepEqual(value.actual.route, {
    intent: 'REEL_VIDEO_QUESTION',
    referenceTarget: 'SHARED_REEL',
    reelQuestionType: 'TRANSCRIPT_CONTENT',
    requiredEvidence: ['TRANSCRIPT'],
    needsRetrieval: true,
    needsVerification: true,
    recommendationActionType: 'NONE',
  });
  assert.equal(value.actual.citations[0].evidenceId, 'reel:r1:chunk:0');
  assert.equal(value.trace.ragTraceId, 'trace-1');
});

test('missing persisted route fields remain missing instead of using expected fixture values', () => {
  const value = normalizeCase(
    {
      caseId: 'C-MISSING',
      question: 'Question?',
      referenceAnswerText: 'Expected answer.',
      reelId: 'r1',
      expectedEvidenceType: 'TRANSCRIPT',
    },
    { status: 'EVALUATED', finalAnswer: 'Actual answer.', citations: [] },
    { intent: 'REEL_VIDEO_QUESTION', workflowMetrics: { diagnostics: {} } },
    'run-missing',
  );
  assert.equal(value.actual.route.intent, 'REEL_VIDEO_QUESTION');
  assert.equal(value.actual.route.referenceTarget, null);
  assert.equal(value.actual.route.reelQuestionType, null);
  assert.deepEqual(value.actual.route.requiredEvidence, []);
});

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
