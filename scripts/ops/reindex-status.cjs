const { publishRmqMessage } = require('../send-rmq-message.cjs');

async function getReindexStatus(reelId) {
  if (typeof reelId !== 'string' || !reelId.trim()) {
    throw new Error('Usage: pnpm run ops:reindex:status -- <reelId>');
  }
  return publishRmqMessage({
    queue: 'content_queue',
    pattern: 'content.get_reel_status',
    payload: { reelId: reelId.trim() },
  });
}

async function main() {
  const reelId = process.argv.slice(2).find((value) => value !== '--');
  const status = await getReindexStatus(reelId);
  process.stdout.write(
    `${JSON.stringify(
      {
        reelId: status.reelId,
        status: status.status,
        mediaStatus: status.mediaStatus,
        indexStatus: status.indexStatus,
        stage: status.stage,
        progress: status.progress,
      },
      null,
      2,
    )}\n`,
  );
}

module.exports = { getReindexStatus };

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(
      `Reindex status failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
