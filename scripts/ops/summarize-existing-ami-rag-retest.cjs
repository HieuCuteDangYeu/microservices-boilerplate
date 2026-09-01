#!/usr/bin/env node

'use strict';

// Deprecated compatibility entrypoint. Ragas is the only scoring/reporting
// authority; this command now emits normalized execution JSONL for Ragas.
const normalizer = require('./normalize-existing-ami-rag-retest.cjs');

module.exports = normalizer;

if (require.main === module) {
  console.error(
    'Deprecated scorer: emitting normalized execution data only. Ragas calculates all scores.',
  );
  normalizer.main();
}
