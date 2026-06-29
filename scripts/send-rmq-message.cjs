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

async function publishRmqMessage({
  queue,
  pattern,
  payload,
  mode = 'send',
  rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  timeoutMs = Number(process.env.RMQ_TIMEOUT_MS || 300000),
  heartbeat = Number(process.env.RABBITMQ_HEARTBEAT_SECONDS || 300),
}) {
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
    if (mode === 'emit') {
      await firstValueFrom(client.emit(pattern, payload));

      return {
        mode,
        queue,
        pattern,
        emitted: true,
      };
    }

    const safeTimeoutMs =
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 300000;

    return await firstValueFrom(
      client.send(pattern, payload).pipe(timeout(safeTimeoutMs)),
    );
  } finally {
    await client.close();
  }
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

  const mode = process.env.RMQ_MODE === 'emit' ? 'emit' : 'send';

  const result = await publishRmqMessage({
    queue,
    pattern,
    payload,
    mode,
  });

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  publishRmqMessage,
};
