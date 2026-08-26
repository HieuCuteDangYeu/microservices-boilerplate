'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const dotenv = require('dotenv');
const { ConfigService } = require('@nestjs/config');

const ROOT = path.resolve(__dirname, '../..');
const { AiApplicationConfigAdapter } = require(
  path.join(
    ROOT,
    'dist/apps/ai-service/apps/ai-service/src/infrastructure/adapters/ai-application-config.adapter.js',
  ),
);
const SAFE_KEY =
  /^(AI_[A-Z_]+_(MODEL|TIMEOUT_MS|MAX_TOKENS)|CLOUDFLARE_STRUCTURED_REASONING_EFFORT|CLOUDFLARE_AI_GATEWAY_(ENABLED|MAX_ATTEMPTS))$/;

function resolveExperiment(
  { envFile, configFile, model, timeoutMs, maxTokens, mode, subset },
  inherited = process.env,
) {
  const parsed = dotenv.parse(fs.readFileSync(path.resolve(ROOT, envFile)));
  const candidateText = fs.readFileSync(path.resolve(ROOT, configFile), 'utf8');
  const candidate = JSON.parse(candidateText);
  if (
    candidate.schemaVersion !== 'rag-candidate-config-v1' ||
    !candidate.variantName ||
    candidate.datasetVersion !== 'rag-generalization-v1'
  ) {
    throw new Error('Invalid versioned candidate configuration');
  }
  for (const [key, value] of Object.entries(candidate.env)) {
    if (!SAFE_KEY.test(key) || typeof value !== 'string')
      throw new Error(`Unsafe candidate key: ${key}`);
  }
  // Credential env and inherited values remain private; explicit candidate values win.
  const values = { ...parsed, ...inherited, ...candidate.env };
  const sources = Object.fromEntries(
    Object.keys(candidate.env).map((key) => [key, 'VERSIONED_CANDIDATE']),
  );
  const overrides = { ...candidate.experimentOverrides };
  if (timeoutMs !== undefined) {
    values.AI_ROUTER_TIMEOUT_MS = String(timeoutMs);
    sources.AI_ROUTER_TIMEOUT_MS = 'CLI_OVERRIDE';
    overrides.routerTimeoutMs = Number(timeoutMs);
  }
  const required = [
    'AI_ROUTER_MODEL',
    'AI_ROUTER_FALLBACK_MODEL',
    'AI_ROUTER_TIMEOUT_MS',
    'AI_ROUTER_FALLBACK_TIMEOUT_MS',
    'AI_ROUTER_MAX_TOKENS',
    'CLOUDFLARE_STRUCTURED_REASONING_EFFORT',
    'CLOUDFLARE_AI_GATEWAY_ENABLED',
  ];
  if (maxTokens !== undefined) {
    values.AI_ROUTER_MAX_TOKENS = String(maxTokens);
    sources.AI_ROUTER_MAX_TOKENS = 'CLI_OVERRIDE';
    overrides.routerMaxCompletionTokens = Number(maxTokens);
  }
  const role = mode === 'SUFFICIENCY' ? 'CONTEXT_SUFFICIENCY' : mode;
  required.push(
    `AI_${role}_MODEL`,
    `AI_${role}_TIMEOUT_MS`,
    `AI_${role}_MAX_TOKENS`,
  );
  for (const key of new Set(required)) {
    if (
      values[key] === undefined ||
      (values[key] === '' && key !== 'AI_ROUTER_FALLBACK_MODEL')
    )
      throw new Error(`Explicit candidate config required: ${key}`);
    sources[key] ??=
      inherited[key] !== undefined ? 'INHERITED_ENV' : 'ENV_FILE';
  }
  if (
    !['low', 'medium', 'high'].includes(
      values.CLOUDFLARE_STRUCTURED_REASONING_EFFORT,
    )
  )
    throw new Error('Explicit structured reasoning effort required');
  if (!['true', 'false'].includes(values.CLOUDFLARE_AI_GATEWAY_ENABLED))
    throw new Error('Explicit gateway boolean required');
  const service = new ConfigService(values);
  service.skipProcessEnv = true;
  const config = new AiApplicationConfigAdapter(service);
  const candidatePrimary = config.model('ROUTER');
  const candidateFallback = config.get('AI_ROUTER_FALLBACK_MODEL') || null;
  if (model) {
    values[`AI_${role}_MODEL`] = model;
    overrides.roleModel = model;
  }
  if (candidate.experimentOverrides?.routerFallbackDisabled)
    values.AI_ROUTER_FALLBACK_MODEL = '';
  const datasetPath = path.join(
    ROOT,
    'eval/rag/datasets',
    `${candidate.datasetVersion}.jsonl`,
  );
  const caseIds = subset ? candidate.subsets?.[subset] : undefined;
  if (
    subset &&
    (!Array.isArray(caseIds) ||
      !caseIds.length ||
      new Set(caseIds).size !== caseIds.length)
  )
    throw new Error(`Invalid subset: ${subset}`);
  const snapshot = {
    schemaVersion: 'rag-effective-config-v1',
    gitSha: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim(),
    datasetVersion: candidate.datasetVersion,
    datasetSha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(datasetPath))
      .digest('hex'),
    variantName: candidate.variantName,
    candidateConfigSha256: crypto
      .createHash('sha256')
      .update(candidateText)
      .digest('hex'),
    configSource: path.relative(ROOT, path.resolve(ROOT, configFile)),
    envSource: path.relative(ROOT, path.resolve(ROOT, envFile)),
    valueSources: sources,
    overrides,
    candidateRouterPrimaryModel: candidatePrimary,
    candidateRouterFallbackModel: candidateFallback,
    routerPrimaryModel: config.model('ROUTER'),
    routerFallbackModel: config.get('AI_ROUTER_FALLBACK_MODEL') || null,
    routerTimeoutMs: config.timeoutMs('ROUTER'),
    routerFallbackTimeoutMs: config.number(
      'AI_ROUTER_FALLBACK_TIMEOUT_MS',
      30000,
      500,
      120000,
    ),
    routerMaxCompletionTokens: config.maxCompletionTokens('ROUTER'),
    routerFallbackMaxCompletionTokens: config.number(
      'AI_ROUTER_FALLBACK_MAX_TOKENS',
      config.maxCompletionTokens('ROUTER'),
      128,
      4096,
    ),
    structuredReasoningEffort: values.CLOUDFLARE_STRUCTURED_REASONING_EFFORT,
    aiGatewayEnabled: config.boolean('CLOUDFLARE_AI_GATEWAY_ENABLED', true),
    aiGatewayMaxAttempts: config.number(
      'CLOUDFLARE_AI_GATEWAY_MAX_ATTEMPTS',
      1,
      1,
      3,
    ),
    role,
    roleModel: config.model(role),
    configuredTimeoutMs: config.timeoutMs(role),
    maxCompletionTokens: config.maxCompletionTokens(role),
    subset: subset || 'full',
    caseIds: caseIds || null,
    calibrationReuseInFullComparison:
      candidate.calibrationReuseInFullComparison === true,
  };
  return { service, config, snapshot, caseIds };
}

module.exports = { resolveExperiment };
