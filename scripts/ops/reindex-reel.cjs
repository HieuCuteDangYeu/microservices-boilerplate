const { publishRmqMessage } = require('../send-rmq-message.cjs');

async function reindexReel(reelId) {
  if (typeof reelId !== 'string' || !reelId.trim()) {
    throw new Error('Usage: pnpm run ops:reindex:reel -- <reelId>');
  }
  return publishRmqMessage({
    queue: 'content_queue',
    pattern: 'content.reindex_reel',
    payload: { reelId: reelId.trim() },
  });
}

async function main() {
  const reelId = process.argv[2];
  const result = await reindexReel(reelId);
  process.stdout.write(
    `${JSON.stringify({ reelId, queued: result.queued, indexAttemptId: result.indexAttemptId }, null, 2)}\n`,
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
