const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const runner = require('./run-existing-ami-rag-retest.cjs');

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
