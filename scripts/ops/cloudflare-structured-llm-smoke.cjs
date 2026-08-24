#!/usr/bin/env node

if (process.env.CLOUDFLARE_STRUCTURED_SMOKE !== 'true') {
  console.error(
    'Set CLOUDFLARE_STRUCTURED_SMOKE=true to run this provider smoke test.',
  );
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const role = process.env.CLOUDFLARE_STRUCTURED_SMOKE_ROLE || 'VERIFIER';
const allowedRoles = new Set([
  'ROUTER',
  'RETRIEVAL_PLANNER',
  'VERIFIER',
  'VERIFIER_ESCALATION',
]);
if (!allowedRoles.has(role)) {
  console.error('CLOUDFLARE_STRUCTURED_SMOKE_ROLE is not supported.');
  process.exit(1);
}
const model = process.env[`AI_${role}_MODEL`];
const maxTokens = Number(
  process.env.CLOUDFLARE_STRUCTURED_SMOKE_MAX_TOKENS ||
    (role === 'ROUTER' || role === 'RETRIEVAL_PLANNER'
      ? 2048
      : role === 'VERIFIER_ESCALATION'
        ? process.env.AI_VERIFIER_ESCALATION_MAX_TOKENS || 1024
        : process.env.AI_VERIFIER_MAX_TOKENS || 650),
);
const reasoningEffort = role.startsWith('VERIFIER')
  ? process.env.CLOUDFLARE_STRUCTURED_REASONING_EFFORT || 'low'
  : undefined;

if (!accountId || !apiToken || !model || !Number.isFinite(maxTokens)) {
  console.error(
    'Cloudflare credentials, role model, and a finite output budget must be set.',
  );
  process.exit(1);
}

const verifierSchema = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    issues: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 300 },
    },
    requiresRevision: { type: 'boolean' },
    revisedInstruction: { type: 'string', maxLength: 500 },
    contradictions: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 300 },
    },
    supportedClaimMappings: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'evidenceIds'],
        properties: {
          claim: { type: 'string', maxLength: 500 },
          evidenceIds: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string', maxLength: 64 },
          },
        },
      },
    },
  },
  required: [
    'passed',
    'confidence',
    'issues',
    'requiresRevision',
    'revisedInstruction',
    'contradictions',
    'supportedClaimMappings',
  ],
  additionalProperties: false,
};

const plannerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['query'],
  properties: { query: { type: 'string', maxLength: 500 } },
};

const routerSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'intent',
    'needsRetrieval',
    'needsUserMemory',
    'needsConversationSummary',
    'needsVerification',
    'reelQuestionType',
    'requiredEvidence',
    'recommendationAction',
    'reason',
  ],
  properties: {
    intent: {
      type: 'string',
      enum: [
        'NORMAL_CHAT',
        'REEL_VIDEO_QUESTION',
        'CONVERSATION_MEMORY_QUESTION',
        'USER_MEMORY_QUESTION',
        'TASK_ACTION_REQUEST',
      ],
    },
    needsRetrieval: { type: 'boolean' },
    needsUserMemory: { type: 'boolean' },
    needsConversationSummary: { type: 'boolean' },
    needsVerification: { type: 'boolean' },
    reelQuestionType: {
      type: 'string',
      enum: [
        'NONE',
        'TRANSCRIPT_CONTENT',
        'VISUAL_CONTENT',
        'GENERAL_REEL_SUMMARY',
        'REEL_METADATA',
        'AMBIGUOUS_REEL_REFERENCE',
      ],
    },
    requiredEvidence: {
      type: 'array',
      maxItems: 7,
      items: {
        type: 'string',
        enum: [
          'NONE',
          'TRANSCRIPT',
          'VISUAL',
          'AUDIO',
          'METADATA',
          'CONVERSATION_MEMORY',
          'USER_MEMORY',
        ],
      },
    },
    recommendationAction: {
      type: 'object',
      additionalProperties: false,
      required: [
        'type',
        'query',
        'minRelevantItems',
        'allowPersonalizedFallback',
        'suggestedQueries',
        'reason',
      ],
      properties: {
        type: {
          type: 'string',
          enum: ['NONE', 'RECOMMEND_REELS', 'SUGGEST_QUERIES'],
        },
        query: { type: 'string', maxLength: 500 },
        minRelevantItems: { type: 'number' },
        allowPersonalizedFallback: { type: 'boolean' },
        suggestedQueries: {
          type: 'array',
          maxItems: 8,
          items: { type: 'string', maxLength: 500 },
        },
        reason: { type: 'string', maxLength: 500 },
      },
    },
    reason: { type: 'string', maxLength: 500 },
  },
};

const schema =
  role === 'ROUTER'
    ? routerSchema
    : role === 'RETRIEVAL_PLANNER'
      ? plannerSchema
      : verifierSchema;

function valid(result) {
  if (role === 'RETRIEVAL_PLANNER') {
    return (
      result && typeof result.query === 'string' && result.query.length <= 500
    );
  }
  if (role === 'ROUTER') {
    return (
      result &&
      typeof result.intent === 'string' &&
      typeof result.needsRetrieval === 'boolean' &&
      typeof result.needsUserMemory === 'boolean' &&
      typeof result.needsConversationSummary === 'boolean' &&
      typeof result.needsVerification === 'boolean' &&
      typeof result.reelQuestionType === 'string' &&
      Array.isArray(result.requiredEvidence) &&
      typeof result.recommendationAction?.type === 'string' &&
      typeof result.recommendationAction?.query === 'string' &&
      typeof result.recommendationAction?.minRelevantItems === 'number' &&
      typeof result.recommendationAction?.allowPersonalizedFallback ===
        'boolean' &&
      Array.isArray(result.recommendationAction?.suggestedQueries) &&
      typeof result.recommendationAction?.reason === 'string' &&
      typeof result.reason === 'string'
    );
  }
  const boundedStrings = (value, maxItems, maxLength) =>
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === 'string' && item.length <= maxLength);
  return (
    result &&
    typeof result.passed === 'boolean' &&
    typeof result.confidence === 'number' &&
    result.confidence >= 0 &&
    result.confidence <= 1 &&
    boundedStrings(result.issues, 8, 300) &&
    typeof result.requiresRevision === 'boolean' &&
    typeof result.revisedInstruction === 'string' &&
    result.revisedInstruction.length <= 500 &&
    boundedStrings(result.contradictions, 8, 300) &&
    Array.isArray(result.supportedClaimMappings) &&
    result.supportedClaimMappings.length <= 12 &&
    result.supportedClaimMappings.every(
      (mapping) =>
        typeof mapping?.claim === 'string' &&
        mapping.claim.length <= 500 &&
        Array.isArray(mapping.evidenceIds) &&
        mapping.evidenceIds.length <= 3 &&
        mapping.evidenceIds.every(
          (id) => typeof id === 'string' && id.length <= 64,
        ),
    )
  );
}

async function main() {
  const prompts = rolePrompts();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'cf-aig-skip-cache': 'true',
        ...(process.env.CLOUDFLARE_AI_GATEWAY_ENABLED !== 'false'
          ? { 'cf-aig-gateway-id': process.env.CLOUDFLARE_AI_GATEWAY_ID }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: prompts.system,
          },
          {
            role: 'user',
            content: prompts.user,
          },
        ],
        max_tokens: maxTokens,
        temperature: 0,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        response_format: { type: 'json_schema', json_schema: schema },
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok)
    throw new Error(`Provider returned HTTP ${response.status}`);
  const choice = payload?.choices?.[0];
  const finishReason = choice?.finish_reason ?? 'missing';
  if (finishReason === 'length') {
    throw new Error(
      `Structured completion truncated (model=${model}, maxTokens=${maxTokens}, finishReason=length)`,
    );
  }
  const content = choice?.message?.content;
  if (content && typeof content === 'object') {
    if (!valid(content))
      throw new Error('Structured provider returned schema-incompatible JSON.');
    report(response.status, finishReason, payload.usage);
    return;
  }
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(
      `Structured provider returned no content (finish_reason=${choice?.finish_reason ?? 'missing'}).`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Structured provider returned invalid JSON.');
  }
  if (!valid(parsed))
    throw new Error('Structured provider returned schema-incompatible JSON.');

  report(response.status, finishReason, payload.usage);
}

function rolePrompts() {
  if (role === 'ROUTER') {
    return {
      system:
        'Classify the user message semantically. Return only JSON matching the routing schema. Do not answer the user or expose reasoning.',
      user: 'A shared synthetic reel is available. User message: What color is the beacon visible in this reel?',
    };
  }
  if (role === 'RETRIEVAL_PLANNER') {
    return {
      system:
        'Rewrite the reel retrieval question as one concise search query. Preserve entities and modality. Return only JSON matching the schema.',
      user: 'USER QUESTION: What color is the beacon visible in the synthetic reel?\nREQUIRED EVIDENCE: VISUAL\nPREVIOUS QUERY: beacon color',
    };
  }
  return {
    system:
      'Check every factual claim against the authorized evidence and requested relation/modality. Return only compact JSON matching the schema. Use only evidence IDs; do not repeat evidence text or expose reasoning.',
    user: JSON.stringify({
      question:
        'Which objects orbit the synthetic quasar, and which color is the observatory beacon?',
      requiredEvidence: ['TRANSCRIPT', 'VISUAL'],
      answer:
        'The zorb and the neral orbit the quasar. The observatory beacon is blue.',
      proposedClaims: [
        'The zorb orbits the quasar.',
        'The neral orbits the quasar.',
        'The observatory beacon is blue.',
      ],
      evidence: [
        {
          evidenceId: 'e0',
          evidenceType: 'TRANSCRIPT',
          evidenceText:
            'The zorb and the neral orbit the quasar during the synthetic observation.',
        },
        {
          evidenceId: 'e1',
          evidenceType: 'VISUAL',
          evidenceText:
            'A blue beacon is visible above the synthetic observatory.',
        },
        {
          evidenceId: 'e2',
          evidenceType: 'METADATA',
          evidenceText: 'Synthetic fixture; no private or production data.',
        },
        {
          evidenceId: 'e3',
          evidenceType: 'TRANSCRIPT',
          evidenceText:
            'The presenter explicitly distinguishes the zorb from a fern beside a lake.',
        },
      ],
    }),
  };
}

function report(status, finishReason, usage) {
  console.log('MODEL_ACTIVE=YES');
  console.log(`ROLE=${role}`);
  console.log(`MODEL=${model}`);
  console.log(`MAX_TOKENS=${maxTokens}`);
  console.log(`REASONING_EFFORT=${reasoningEffort ?? 'NOT_SENT'}`);
  console.log(`HTTP=${status}`);
  console.log(`FINISH_REASON=${finishReason}`);
  console.log(`PROMPT_TOKENS=${usage?.prompt_tokens ?? 'NOT_RETURNED'}`);
  console.log(
    `COMPLETION_TOKENS=${usage?.completion_tokens ?? 'NOT_RETURNED'}`,
  );
  console.log(`TOTAL_TOKENS=${usage?.total_tokens ?? 'NOT_RETURNED'}`);
  console.log('JSON_COMPLETE=YES');
  console.log('STRUCTURED_OUTPUT=PASS');
  console.log('JSON_SCHEMA=PASS');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
