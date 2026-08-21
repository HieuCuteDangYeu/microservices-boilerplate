#!/usr/bin/env node

if (process.env.CLOUDFLARE_STRUCTURED_SMOKE !== 'true') {
  console.error('Set CLOUDFLARE_STRUCTURED_SMOKE=true to run this provider smoke test.');
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const model = '@cf/meta/llama-3.1-8b-instruct-fast';

if (!accountId || !apiToken) {
  console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set.');
  process.exit(1);
}

const schema = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          supported: { type: 'boolean' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
        },
        required: ['claim', 'supported', 'evidenceIds', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['claims'],
  additionalProperties: false,
};

function providerError(status, payload) {
  const messages = [
    payload?.error?.message,
    ...(Array.isArray(payload?.errors)
      ? payload.errors.map((item) => item?.message)
      : []),
  ].filter(Boolean);
  return `HTTP ${status}: ${messages.join(', ') || 'unknown provider error'}`;
}

function valid(result) {
  return (
    result &&
    Array.isArray(result.claims) &&
    result.claims.every(
      (claim) =>
        claim &&
        typeof claim.claim === 'string' &&
        typeof claim.supported === 'boolean' &&
        Array.isArray(claim.evidenceIds) &&
        claim.evidenceIds.every((id) => typeof id === 'string') &&
        typeof claim.confidence === 'number',
    )
  );
}

async function main() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Return the requested JSON object only.',
          },
          {
            role: 'user',
            content:
              'Assess the claim "Olivier is named" against evidence e0: "Olivier is named." Return one supported claim with evidenceIds ["e0"].',
          },
        ],
        max_tokens: 200,
        temperature: 0,
        response_format: { type: 'json_schema', json_schema: schema },
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(providerError(response.status, payload));
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Structured provider returned no content.');
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Structured provider returned invalid JSON.');
  }
  if (!valid(parsed)) throw new Error('Structured provider returned schema-incompatible JSON.');

  console.log('MODEL_ACTIVE=YES');
  console.log(`HTTP=${response.status}`);
  console.log('STRUCTURED_OUTPUT=PASS');
  console.log('JSON_SCHEMA=PASS');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
