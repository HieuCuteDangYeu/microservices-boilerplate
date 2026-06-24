const { ClientProxyFactory, Transport } = require('@nestjs/microservices');
const { firstValueFrom, timeout } = require('rxjs');

function parseJsonPayload(rawPayload) {
  try {
    return JSON.parse(rawPayload || '{}');
  } catch {
    throw new Error(`Invalid JSON payload: ${rawPayload}`);
  }
}

function getRequiredValue(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `Missing ${name}. Usage: node scripts/send-rmq-message.cjs <queue> <pattern> <jsonPayload>`,
    );
  }

  return value.trim();
}

async function main() {
  const queue = getRequiredValue(
    process.env.RMQ_QUEUE || process.argv[2],
    'queue',
  );

  const pattern = getRequiredValue(
    process.env.RMQ_PATTERN || process.argv[3],
    'pattern',
  );

  const payload = parseJsonPayload(process.env.RMQ_PAYLOAD || process.argv[4]);

  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

  const heartbeat = Number(process.env.RABBITMQ_HEARTBEAT_SECONDS || 300);
  const timeoutMs = Number(process.env.RMQ_TIMEOUT_MS || 300000);

  const client = ClientProxyFactory.create({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue,
      queueOptions: {
        durable: true,
      },
      heartbeat: Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
    },
  });

  await client.connect();

  try {
    const result = await firstValueFrom(
      client
        .send(pattern, payload)
        .pipe(
          timeout(
            Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300000,
          ),
        ),
    );

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
