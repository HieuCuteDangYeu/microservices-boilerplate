const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const script = path.join(__dirname, 'summarize-existing-ami-rag-retest.cjs');
const definition = {
  reels: [],
  ragBenchmark: {
    cases: [
      {
        caseId: 'case-1',
        question: 'Who?',
        reelId: 'r1',
        expectedEvidenceType: 'TRANSCRIPT',
        referenceStartSec: 0,
        referenceEndSec: 5,
        referenceAnswerText: 'Olivier',
      },
    ],
  },
};

function summarize(trace) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-summary-'));
  const definitions = path.join(directory, 'definitions.json');
  const traces = path.join(directory, 'traces.json');
  fs.writeFileSync(definitions, JSON.stringify(definition));
  fs.writeFileSync(traces, JSON.stringify([trace]));
  const output = childProcess
    .execFileSync(
      'node',
      [script, '--definitions-report', definitions, '--trace-file', traces],
      {
        cwd: root,
        encoding: 'utf8',
        // The parent runs under Node's test harness. Do not accidentally run
        // the summarizer itself as a nested test process.
        env: { ...process.env, NODE_OPTIONS: '' },
      },
    )
    .trim();
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  fs.rmSync(directory, { recursive: true, force: true });
  fs.unlinkSync(output);
  return report.ragBenchmark.cases[0];
}

const base = (diagnostics) => ({
  message: 'Who?',
  answer: 'I do not have enough verified shared reel evidence.',
  intent: 'REEL_VIDEO_QUESTION',
  needsRetrieval: true,
  retrievedChunkIds: ['r1:0'],
  citations: [],
  workflowMetrics: diagnostics ? { diagnostics } : {},
});

test('summarizes new persisted diagnostics and prefers explicit failure source', () => {
  const item = summarize(
    base({
      contextSufficiency: {
        providerStatus: 'ERROR',
        decisionSource: 'PROVIDER_FALLBACK',
      },
      draftHistory: [{ revision: 0, source: 'INITIAL', answer: 'Olivier.' }],
      verification: {
        providerStatus: 'SUCCESS',
        decisionSource: 'LLM',
        providerPassed: true,
        finalPassed: true,
      },
      citationAttempts: [
        {
          attempt: 0,
          decisionSource: 'LLM',
          coverage: 1,
          selectedEvidenceIds: ['e0'],
          deterministicSupportingEvidenceIds: [],
        },
      ],
      finalFailureSource: 'NO_CONTEXT',
    }),
  );
  assert.equal(item.firstFailingStage, 'NO_CONTEXT');
  assert.equal(item.diagnostics.context.providerStatus, 'ERROR');
  assert.equal(item.diagnostics.drafts[0].source, 'INITIAL');
  assert.equal(item.diagnostics.verifier.decisionSource, 'LLM');
  assert.equal(
    item.diagnostics.citationAttempts[0].selectedEvidenceIds[0],
    'e0',
  );
});

test('summarizes legacy traces without diagnostics using safe unavailable defaults', () => {
  const item = summarize(base());
  assert.equal(item.diagnostics.context, 'NOT_AVAILABLE');
  assert.equal(item.diagnostics.drafts, 'NOT_AVAILABLE');
  assert.equal(item.diagnostics.finalFailureSource, 'NOT_AVAILABLE');
});
