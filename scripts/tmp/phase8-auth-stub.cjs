const amqp = require('amqplib');

const AUTH_QUEUE = 'auth_queue';

function assertLoopbackRabbitUrl(value) {
  if (!value) {
    throw new Error('PHASE8_STUB_RABBITMQ_URL is required.');
  }

  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('Phase 8 auth stub only accepts a loopback RabbitMQ URL.');
  }

  return value;
}

async function main() {
  const rabbitUrl = assertLoopbackRabbitUrl(
    process.env.PHASE8_STUB_RABBITMQ_URL,
  );
  const token = process.env.PHASE8_STUB_TOKEN?.trim();

  if (!token) {
    throw new Error('PHASE8_STUB_TOKEN is required.');
  }

  const connection = await amqp.connect(rabbitUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue(AUTH_QUEUE, { durable: true });
  await channel.prefetch(10);

  const close = async () => {
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
  };

  process.once('SIGINT', () => void close().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void close().finally(() => process.exit(0)));

  await channel.consume(AUTH_QUEUE, (message) => {
    if (!message) return;

    try {
      const request = JSON.parse(message.content.toString('utf8'));
      const valid =
        request.pattern === 'auth.verify_token' &&
        request.data?.token === token;
      const payload = valid
        ? {
            response: {
              id: 'phase8-local-user',
              email: 'phase8-local@invalid.example',
              fullName: 'Phase 8 Local',
              username: 'phase8-local',
              isVerified: true,
              roles: ['USER'],
            },
            isDisposed: true,
          }
        : {
            err: { statusCode: 401, message: 'Invalid Phase 8 token' },
            isDisposed: true,
          };

      if (message.properties.replyTo) {
        channel.sendToQueue(
          message.properties.replyTo,
          Buffer.from(JSON.stringify(payload)),
          { correlationId: message.properties.correlationId },
        );
      }
    } finally {
      channel.ack(message);
    }
  });

  process.stdout.write('Phase 8 loopback auth stub is ready.\n');
}

module.exports = { AUTH_QUEUE, assertLoopbackRabbitUrl };

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`Phase 8 auth stub failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
