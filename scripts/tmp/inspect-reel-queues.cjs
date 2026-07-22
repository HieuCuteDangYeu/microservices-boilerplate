const amqp = require('amqplib');

const QUEUES = [
  'reel_media_short_jobs',
  'reel_media_long_jobs',
  'reel_media_short_retry_30s',
  'reel_media_short_retry_5m',
  'reel_media_short_dlq',
  'reel_media_long_retry_60s',
  'reel_media_long_retry_10m',
  'reel_media_long_dlq',
];

async function inspectQueues(url = process.env.RABBITMQ_URL) {
  if (!url) {
    throw new Error('RABBITMQ_URL is required.');
  }

  const connection = await amqp.connect(url);

  try {
    const queues = [];

    for (const queue of QUEUES) {
      const channel = await connection.createChannel();

      try {
        const result = await channel.checkQueue(queue);
        queues.push({
          queue,
          exists: true,
          messages: result.messageCount,
          consumers: result.consumerCount,
        });
      } catch (error) {
        queues.push({
          queue,
          exists: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await channel.close().catch(() => undefined);
      }
    }

    return queues;
  } finally {
    await connection.close().catch(() => undefined);
  }
}

async function main() {
  const queues = await inspectQueues();

  process.stdout.write(`${JSON.stringify({ queues }, null, 2)}\n`);

  if (queues.some((queue) => !queue.exists)) {
    process.exitCode = 1;
  }
}

module.exports = { inspectQueues, QUEUES };

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(
      `Reel queue inspection failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
