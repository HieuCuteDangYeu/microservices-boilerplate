const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const runner = require('./run-existing-ami-rag-retest.cjs');

const definitions = Array.from({ length: 8 }, (_, index) => ({
  caseId: `case-${index + 1}`,
}));
const stateFor = (statuses = {}) => ({
  cases: Object.fromEntries(
    definitions.map(({ caseId }) => [
      caseId,
      { status: statuses[caseId] || 'PENDING' },
    ]),
  ),
});

test('fresh eight cases transition through persisted in-flight state exactly once', () => {
  const state = stateFor();
  const calls = [];
  for (const definition of runner.pendingCases(state, definitions)) {
    runner.markCaseInFlight(state, definition.caseId, () => {
      assert.equal(state.cases[definition.caseId].status, 'IN_FLIGHT');
    });
    calls.push(definition.caseId);
    runner.completeCase(
      state,
      definition.caseId,
      { result: { caseId: definition.caseId } },
      () => {},
    );
  }
  assert.deepEqual(
    calls,
    definitions.map(({ caseId }) => caseId),
  );
  assert.deepEqual(runner.formatStatus('fresh', state).counts, {
    PENDING: 0,
    IN_FLIGHT: 0,
    COMPLETED: 8,
    FAILED: 0,
  });
});

test('resume skips completed cases and executes only the remaining six', () => {
  const state = stateFor({ 'case-1': 'COMPLETED', 'case-2': 'COMPLETED' });
  assert.deepEqual(
    runner.pendingCases(state, definitions).map(({ caseId }) => caseId),
    definitions.slice(2).map(({ caseId }) => caseId),
  );
});

test('completed resume is zero-write and ambiguous in-flight fails before replay', () => {
  const completed = stateFor(
    Object.fromEntries(definitions.map(({ caseId }) => [caseId, 'COMPLETED'])),
  );
  assert.equal(runner.pendingCases(completed, definitions).length, 0);
  const ambiguous = stateFor({ 'case-2': 'IN_FLIGHT' });
  assert.throws(() => runner.pendingCases(ambiguous, definitions), /IN_FLIGHT/);
  assert.equal(ambiguous.cases['case-2'].status, 'IN_FLIGHT');
});

test('different run IDs have independent locks', () => {
  const one = `test-a-${Date.now()}-${Math.random()}`;
  const two = `test-b-${Date.now()}-${Math.random()}`;
  const releaseOne = runner.lockRun(one);
  const releaseTwo = runner.lockRun(two);
  releaseTwo();
  releaseOne();
});

test('status format is read-only and warns for ambiguous in-flight work', () => {
  const output = runner.formatStatus('run-a', {
    cases: { one: { status: 'COMPLETED' }, two: { status: 'IN_FLIGHT' } },
  });
  assert.equal(output.benchmarkRunId, 'run-a');
  assert.equal(output.counts.COMPLETED, 1);
  assert.equal(output.counts.IN_FLIGHT, 1);
  assert.match(output.warning, /DO NOT RESEND/);
});

test('atomic write leaves a parseable canonical state', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ami-runner-'));
  const file = path.join(directory, 'state.json');
  runner.writeJsonAtomically(file, { cases: { one: { status: 'IN_FLIGHT' } } });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    cases: { one: { status: 'IN_FLIGHT' } },
  });
  fs.rmSync(directory, { recursive: true, force: true });
});

test('same-run lock refuses a second owner before execution', () => {
  const runId = `test-${Date.now()}-${Math.random()}`;
  const release = runner.lockRun(runId);
  assert.throws(() => runner.lockRun(runId), /already locked/);
  release();
});

test('failed executor remains in-flight and is never marked completed', () => {
  const state = stateFor();
  runner.markCaseInFlight(state, 'case-1', () => {});
  assert.equal(state.cases['case-1'].status, 'IN_FLIGHT');
  assert.notEqual(state.cases['case-1'].status, 'COMPLETED');
});
