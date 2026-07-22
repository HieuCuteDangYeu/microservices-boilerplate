const amqp = require('amqplib');
const { randomUUID } = require('node:crypto');

const EXCHANGE = 'reel_media_jobs';
const DEAD_LETTER_EXCHANGE = 'reel_media_dead_letter';

function resolveLane(value = process.env.REEL_QUEUE_FAILURE_TEST_LANE) {
  const lane = value?.trim().toUpperCase() || 'SHORT';

  if (lane !== 'SHORT' && lane !== 'LONG') {
    throw new Error('REEL_QUEUE_FAILURE_TEST_LANE must be SHORT or LONG.');
  }

  return {
    lane,
    routingKey: lane === 'SHORT' ? 'reel.media.short' : 'reel.media.long',
    deadLetterRoutingKey:
      lane === 'SHORT' ? 'reel.media.short.dlq' : 'reel.media.long.dlq',
  };
}

async function waitForDeadLetter(channel, queue, correlationId, timeoutMs) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`DLQ observation timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    void channel.consume(
      queue,
      (message) => {
        if (!message) return;

        channel.ack(message);

        if (message.properties.correlationId === correlationId) {
          clearTimeout(timeout);
          resolve({
            correlationId,
            headers: message.properties.headers ?? {},
          });
        }
      },
      { noAck: false },
    );
  });
}

async function runFailureTest(options = {}) {
  const url = options.url ?? process.env.RABBITMQ_URL;

  if (!url) {
    throw new Error('RABBITMQ_URL is required.');
  }

  const lane = resolveLane(options.lane);
  const timeoutMs = Number(
    options.timeoutMs ??
      process.env.REEL_QUEUE_FAILURE_TEST_TIMEOUT_MS ??
      15000,
  );

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('REEL_QUEUE_FAILURE_TEST_TIMEOUT_MS must be positive.');
  }

  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();

  try {
    await channel.checkExchange(EXCHANGE);
    await channel.checkExchange(DEAD_LETTER_EXCHANGE);
    const temporaryQueue = await channel.assertQueue('', {
      exclusive: true,
      autoDelete: true,
    });
    await channel.bindQueue(
      temporaryQueue.queue,
      DEAD_LETTER_EXCHANGE,
      lane.deadLetterRoutingKey,
    );

    const correlationId = randomUUID();
    const observed = waitForDeadLetter(
      channel,
      temporaryQueue.queue,
      correlationId,
      timeoutMs,
    );
    const published = channel.publish(
      EXCHANGE,
      lane.routingKey,
      Buffer.from(
        JSON.stringify({
          pattern: 'reel.media.process',
          data: { malformedFailureTestId: correlationId },
        }),
      ),
      {
        persistent: true,
        contentType: 'application/json',
        correlationId,
        headers: { 'x-temporary-failure-test': true },
      },
    );

    if (!published) {
      await new Promise((resolve) => channel.once('drain', resolve));
    }

    return { lane: lane.lane, ...(await observed) };
  } finally {
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
  }
}

async function main() {
  const result = await runFailureTest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

module.exports = { resolveLane, runFailureTest };

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(
      `Reel queue failure test failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
