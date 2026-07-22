const amqp = require('amqplib');
const { createHash } = require('node:crypto');

const AI_QUEUE = 'ai_queue';
const EMBEDDING_DIMENSIONS = 384;

function assertLoopbackRabbitUrl(value) {
  if (!value) {
    throw new Error('PHASE8_STUB_RABBITMQ_URL is required.');
  }

  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('Phase 8 AI stub only accepts a loopback RabbitMQ URL.');
  }

  return value;
}

function parseMode(value) {
  const mode = value?.trim().toLowerCase() || 'success';
  if (!['success', 'unavailable'].includes(mode)) {
    throw new Error('PHASE8_AI_STUB_MODE must be success or unavailable.');
  }
  return mode;
}

function parseDelayMs(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 60_000) {
    throw new Error('PHASE8_AI_STUB_DELAY_MS must be between 0 and 60000.');
  }
  return parsed;
}

function deterministicEmbedding(value) {
  const digest = createHash('sha256').update(value).digest();
  const embedding = Array.from(
    { length: EMBEDDING_DIMENSIONS },
    (_, index) => (digest[index % digest.length] - 127.5) / 127.5,
  );
  const magnitude = Math.sqrt(
    embedding.reduce((total, item) => total + item * item, 0),
  );
  return embedding.map((item) => item / magnitude);
}

function successResponse(request) {
  if (request.pattern === 'ai.transcribe_audio') {
    const text =
      'Phase 8 deterministic local transcript about semantic video search.';
    return {
      transcript: text,
      transcription: {
        text,
        segments: [{ id: 0, start: 0, end: 5, text }],
        wordCount: text.split(/\s+/).length,
        provider: 'phase8-local',
        model: 'deterministic-transcriber',
        version: '1',
      },
    };
  }

  if (request.pattern === 'ai.extract_reel_metadata') {
    return {
      metadata: {
        title: request.data?.title || 'Phase 8 semantic video',
        description:
          request.data?.description ||
          'Deterministic metadata generated for isolated Phase 8 validation.',
        tags: ['phase8', 'semantic-search', 'local-validation'],
      },
    };
  }

  if (request.pattern === 'ai.generate_embedding_batch') {
    const items = Array.isArray(request.data?.items) ? request.data.items : [];
    return {
      embeddings: items.map((item) => ({
        id: item.id,
        values: deterministicEmbedding(`${item.id}:${item.text}`),
        model: 'gemini-embedding-001',
        dimensions: EMBEDDING_DIMENSIONS,
        provider: 'google',
        version: '1',
      })),
      errors: [],
    };
  }

  throw new Error(`Unsupported Phase 8 AI pattern: ${request.pattern}`);
}

async function main() {
  const rabbitUrl = assertLoopbackRabbitUrl(
    process.env.PHASE8_STUB_RABBITMQ_URL,
  );
  const mode = parseMode(process.env.PHASE8_AI_STUB_MODE);
  const delayMs = parseDelayMs(process.env.PHASE8_AI_STUB_DELAY_MS);
  const connection = await amqp.connect(rabbitUrl);
  const channel = await connection.createChannel();
  await channel.assertQueue(AI_QUEUE, { durable: true });
  await channel.prefetch(10);

  const close = async () => {
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
  };

  process.once('SIGINT', () => void close().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void close().finally(() => process.exit(0)));

  await channel.consume(AI_QUEUE, async (message) => {
    if (!message) return;

    try {
      const request = JSON.parse(message.content.toString('utf8'));
      let payload;
      try {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        payload =
          mode === 'unavailable'
            ? {
                err: {
                  statusCode: 503,
                  message: 'Phase 8 simulated AI unavailability',
                },
                isDisposed: true,
              }
            : { response: successResponse(request), isDisposed: true };
      } catch (error) {
        payload = {
          err: { statusCode: 400, message: error.message },
          isDisposed: true,
        };
      }

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

  process.stdout.write(`Phase 8 loopback AI stub is ready (${mode}).\n`);
}

module.exports = {
  AI_QUEUE,
  EMBEDDING_DIMENSIONS,
  assertLoopbackRabbitUrl,
  deterministicEmbedding,
  parseMode,
  parseDelayMs,
  successResponse,
};

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`Phase 8 AI stub failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
