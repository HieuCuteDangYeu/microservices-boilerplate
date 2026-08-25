#!/usr/bin/env node

'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '../..');
const evaluationRoot = path.join(repositoryRoot, 'eval/rag');
const mode = process.argv[2] ?? 'offline';
const forwarded = process.argv.slice(3);

const candidates = [
  process.env.UV_BIN,
  'uv',
  path.join(process.env.XDG_BIN_HOME ?? '', 'uv'),
].filter(Boolean);
const uv = candidates.find((candidate) => {
  if (candidate.includes(path.sep)) return fs.existsSync(candidate);
  return spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0;
});

if (!uv) {
  console.error(
    'uv is required for RAG evaluation tooling. Install it from https://docs.astral.sh/uv/.',
  );
  process.exit(2);
}

const commands = {
  offline: ['run', 'rag-eval', 'offline'],
  live: ['run', 'rag-eval', 'live'],
  report: ['run', 'rag-eval', 'report'],
  compare: ['run', 'rag-eval', 'compare'],
  test: ['run', 'pytest', '-q'],
  'capacity-check': ['run', 'rag-eval', 'capacity-check'],
};
const command = commands[mode];
if (!command) {
  console.error(`Unknown RAG evaluation command: ${mode}`);
  process.exit(2);
}

const result = spawnSync(uv, [...command, ...forwarded], {
  cwd: evaluationRoot,
  env: {
    ...process.env,
    UV_CACHE_DIR:
      process.env.UV_CACHE_DIR || path.join(evaluationRoot, '.uv-cache'),
  },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
