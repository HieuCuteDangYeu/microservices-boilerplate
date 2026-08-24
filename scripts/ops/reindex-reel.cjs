const { publishRmqMessage } = require('../send-rmq-message.cjs');

async function reindexReel(reelId, identity = {}) {
  if (typeof reelId !== 'string' || !reelId.trim()) {
    throw new Error(
      'Usage: pnpm run ops:reindex:reel -- <reelId> with AI embedding identity set',
    );
  }
  const model = identity.model || process.env.AI_EMBEDDING_MODEL;
  const version = identity.version || process.env.AI_EMBEDDING_VERSION;
  const dimensions = Number(
    identity.dimensions || process.env.AI_EMBEDDING_DIMENSIONS,
  );
  if (!model || !version || !Number.isInteger(dimensions)) {
    throw new Error(
      'AI_EMBEDDING_MODEL, AI_EMBEDDING_VERSION, and AI_EMBEDDING_DIMENSIONS are required',
    );
  }
  return publishRmqMessage({
    queue: 'reel_index_query',
    pattern: 'index.reindex_reel',
    payload: {
      reelId: reelId.trim(),
      expectedEmbeddingIdentity: { model, version, dimensions },
    },
  });
}

async function main() {
  const reelId = process.argv.slice(2).find((value) => value !== '--');
  const result = await reindexReel(reelId);
  process.stdout.write(
    `${JSON.stringify({ reelId, queued: result.queued, indexAttemptId: result.indexAttemptId, embeddingIdentity: result.embeddingIdentity }, null, 2)}\n`,
  );
  if (!result.queued) process.exitCode = 1;
}

module.exports = { reindexReel };

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(
      `Reindex request failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
