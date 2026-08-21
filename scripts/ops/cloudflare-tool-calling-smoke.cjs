#!/usr/bin/env node

if (process.env.CLOUDFLARE_TOOL_SMOKE !== 'true') {
  console.error('Set CLOUDFLARE_TOOL_SMOKE=true to run this provider smoke test.');
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const model = process.env.CLOUDFLARE_TOOL_MODEL || '@cf/openai/gpt-oss-20b';

if (!accountId || !apiToken) {
  console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set.');
  process.exit(1);
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
const tool = {
  type: 'function',
  function: {
    name: 'get_fixture_fact',
    description: 'Return a fixed fact for the provider contract smoke test.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
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

async function complete(messages, toolChoice) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      tools: [tool],
      tool_choice: toolChoice,
      parallel_tool_calls: true,
      max_completion_tokens: 128,
      temperature: 0,
      stream: false,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(providerError(response.status, payload));
  const message = payload?.choices?.[0]?.message;
  if (!message) throw new Error('Provider response contained no assistant message.');
  return { message, status: response.status };
}

function logSecondRoundShape(messages) {
  const assistant = messages.find((message) => message.role === 'assistant');
  const toolResult = messages.find((message) => message.role === 'tool');
  console.log(
    JSON.stringify({
      round: 2,
      messageRoles: messages.map((message) => message.role),
      assistantContent: assistant?.content === null ? 'null' : typeof assistant?.content,
      assistantToolCallCount: assistant?.tool_calls?.length ?? 0,
      toolCallIdPresent: Boolean(toolResult?.tool_call_id),
      toolResultNamePresent: Boolean(toolResult?.name),
      requestKeys: [
        'tools',
        'tool_choice',
        'parallel_tool_calls',
        'max_completion_tokens',
        'temperature',
        'stream',
      ],
    }),
  );
}

async function main() {
  const messages = [
    { role: 'system', content: 'Use the provided function exactly once, then answer with its result.' },
    { role: 'user', content: 'What is the fixture fact?' },
  ];
  const first = await complete(messages, 'required');
  const call = first.message.tool_calls?.[0];
  if (!call?.id || !call.function?.name) {
    throw new Error('ROUND_1_FAIL: provider did not return a usable tool call.');
  }
  console.log(`ROUND_1_PASS HTTP_${first.status}`);

  messages.push({
    role: 'assistant',
    content: first.message.content ?? '',
    tool_calls: first.message.tool_calls,
  });
  messages.push({
    role: 'tool',
    tool_call_id: call.id,
    name: call.function.name,
    content: '{"fact":"Olivier"}',
  });
  logSecondRoundShape(messages);
  const second = await complete(messages, 'auto');
  if (typeof second.message.content !== 'string' || !second.message.content.trim()) {
    throw new Error('ROUND_2_FAIL: provider did not return final assistant content.');
  }
  console.log(`ROUND_2_PASS HTTP_${second.status}`);
  console.log('FINAL_RESPONSE_RECEIVED');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
