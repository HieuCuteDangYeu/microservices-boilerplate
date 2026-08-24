#!/usr/bin/env node

if (process.env.CLOUDFLARE_RETRIEVAL_SMOKE !== 'true') {
  console.error(
    'Set CLOUDFLARE_RETRIEVAL_SMOKE=true to run this provider smoke test.',
  );
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const embeddingModel = process.env.AI_EMBEDDING_MODEL;
const rerankerModel = process.env.AI_RERANKER_MODEL;
const dimensions = Number(process.env.AI_EMBEDDING_DIMENSIONS);
if (
  !accountId ||
  !apiToken ||
  !embeddingModel ||
  !rerankerModel ||
  !Number.isInteger(dimensions)
) {
  console.error(
    'Cloudflare credentials and retrieval model identity must be set.',
  );
  process.exit(1);
}

async function run(model, body) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'cf-aig-skip-cache': 'true',
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    throw new Error(`Model ${model} returned HTTP ${response.status}`);
  }
  return payload?.result ?? payload;
}

async function main() {
  const embedding = await run(embeddingModel, {
    text: ['A synthetic zorb orbits a quasar.'],
    truncate_inputs: false,
  });
  const vector = embedding?.data?.[0];
  if (
    !Array.isArray(vector) ||
    vector.length !== dimensions ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      `Embedding provider did not return ${dimensions} finite values.`,
    );
  }

  const reranked = await run(rerankerModel, {
    query: 'Which passage states that a zorb orbits a quasar?',
    contexts: [
      { text: 'A synthetic zorb orbits a quasar.' },
      { text: 'A synthetic fern grows beside a lake.' },
    ],
    top_k: 2,
  });
  const items = reranked?.response ?? reranked;
  if (!Array.isArray(items) || items.length < 1) {
    throw new Error('Reranker returned no scored contexts.');
  }
  const topIndex = Number(items[0]?.id ?? items[0]?.index);
  if (topIndex !== 0 || !Number.isFinite(Number(items[0]?.score))) {
    throw new Error(
      'Reranker did not rank the directly relevant synthetic context first.',
    );
  }

  console.log(`EMBEDDING_MODEL=${embeddingModel}`);
  console.log(`EMBEDDING_DIMENSIONS=${vector.length}`);
  console.log('EMBEDDING_SMOKE=PASS');
  console.log(`RERANKER_MODEL=${rerankerModel}`);
  console.log('RERANKER_SMOKE=PASS');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
