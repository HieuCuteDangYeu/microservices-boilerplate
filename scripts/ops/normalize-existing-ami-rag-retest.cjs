#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function collectModelCalls(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (
    typeof value.model === 'string' &&
    (value.modelRole || value.role) &&
    (value.inputTokens !== undefined || value.usageSource || value.usage)
  ) {
    output.push({
      modelRole: value.modelRole || value.role,
      model: value.model,
      inputTokens: value.inputTokens ?? value.usage?.inputTokens ?? null,
      outputTokens: value.outputTokens ?? value.usage?.outputTokens ?? null,
      totalTokens: value.totalTokens ?? value.usage?.totalTokens ?? null,
      usageSource:
        value.usageSource || (value.usage ? 'PROVIDER' : 'UNAVAILABLE'),
      latencyMs: value.latencyMs ?? null,
      finishReason: value.finishReason ?? null,
      attempt: value.attempt || 1,
      providerStatus: value.providerStatus ?? null,
      providerCategory: value.providerCategory ?? null,
      scope: value.scope || 'QUERY',
    });
    return output;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value))
    collectModelCalls(child, output);
  return output;
}

function normalizeContext(item, rank) {
  if (typeof item === 'string') {
    const parts = item.split(':');
    return {
      evidenceId: item,
      reelId: parts[0] === 'reel' ? parts[1] || null : parts[0] || null,
      evidenceType: 'UNKNOWN',
      rank,
    };
  }
  return {
    evidenceId: item.evidenceId || item.id || item.chunkId,
    reelId: item.reelId || null,
    evidenceType: item.evidenceType || item.type || 'UNKNOWN',
    rank: item.rank || rank,
    ...(item.text ? { text: item.text } : {}),
  };
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function routeDecisionFromTrace(trace) {
  const metrics = objectValue(trace?.workflowMetrics);
  const diagnostics = objectValue(metrics.diagnostics);
  const routeCandidates = [
    trace?.routeDecision,
    metrics.routeDecision,
    diagnostics.routeDecision,
  ].map(objectValue);
  const persisted = routeCandidates.find((candidate) =>
    [
      'intent',
      'referenceTarget',
      'reelQuestionType',
      'requiredEvidence',
      'needsRetrieval',
      'needsVerification',
      'recommendationActionType',
    ].some((key) => Object.hasOwn(candidate, key)),
  );
  let legacy = objectValue(trace?.route);
  if (
    ![
      'intent',
      'referenceTarget',
      'reelQuestionType',
      'requiredEvidence',
      'needsRetrieval',
      'needsVerification',
      'recommendationActionType',
    ].some((key) => Object.hasOwn(legacy, key))
  ) {
    legacy = Object.fromEntries(
      [
        'intent',
        'referenceTarget',
        'reelQuestionType',
        'requiredEvidence',
        'needsRetrieval',
        'needsVerification',
        'recommendationActionType',
      ]
        .filter((key) => Object.hasOwn(trace || {}, key))
        .map((key) => [key, trace[key]]),
    );
  }
  const route = persisted || legacy;
  const requiredEvidence = Array.isArray(route.requiredEvidence)
    ? route.requiredEvidence
    : [];

  return {
    intent: route.intent ?? trace?.intent ?? null,
    referenceTarget: route.referenceTarget ?? null,
    reelQuestionType: route.reelQuestionType ?? null,
    requiredEvidence,
    needsRetrieval: route.needsRetrieval ?? trace?.needsRetrieval ?? null,
    needsVerification: route.needsVerification ?? null,
    recommendationActionType: route.recommendationActionType ?? null,
  };
}

function citationProvenanceFromTrace(trace) {
  const metrics = objectValue(trace?.workflowMetrics);
  const diagnostics = objectValue(metrics.diagnostics);
  const mappings = Array.isArray(metrics.citationEvidenceMappings)
    ? metrics.citationEvidenceMappings
    : Array.isArray(diagnostics.citationEvidenceMappings)
      ? diagnostics.citationEvidenceMappings
      : [];
  const evidenceIds = Array.isArray(metrics.citationEvidenceIds)
    ? metrics.citationEvidenceIds
    : Array.isArray(diagnostics.citationEvidenceIds)
      ? diagnostics.citationEvidenceIds
      : [];
  return {
    mappings: mappings.filter((item) => item && typeof item === 'object'),
    evidenceIds: evidenceIds.filter((item) => typeof item === 'string'),
  };
}

function normalizeCitationProvenance(citations, trace, rerankedContexts) {
  if (!Array.isArray(citations) || citations.length === 0) return [];
  const contextById = new Map(
    rerankedContexts
      .map((item) => [item.evidenceId, item])
      .filter(([evidenceId]) => evidenceId),
  );
  const provenance = citationProvenanceFromTrace(trace);
  const byIndex = new Map();

  for (const mapping of provenance.mappings) {
    const index = mapping.citationIndex;
    const evidenceId = mapping.evidenceId;
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      typeof evidenceId === 'string' &&
      !byIndex.has(index) &&
      contextById.has(evidenceId)
    ) {
      byIndex.set(index, evidenceId);
    }
  }
  if (
    byIndex.size < citations.length &&
    provenance.evidenceIds.length === citations.length
  ) {
    provenance.evidenceIds.forEach((evidenceId, index) => {
      if (contextById.has(evidenceId) && !byIndex.has(index)) {
        byIndex.set(index, evidenceId);
      }
    });
  }

  return citations.map((citation, index) => {
    const evidenceId = byIndex.get(index);
    const context = evidenceId ? contextById.get(evidenceId) : undefined;
    if (
      !context ||
      (citation.reelId &&
        context.reelId &&
        citation.reelId !== context.reelId) ||
      (citation.evidenceType &&
        context.evidenceType &&
        citation.evidenceType !== context.evidenceType)
    ) {
      return { ...citation };
    }
    return { ...citation, evidenceId };
  });
}

function normalizeCase(definition, execution, trace, runId) {
  const diagnostics = trace?.workflowMetrics?.diagnostics || {};
  const retrieved = trace?.retrievedContexts || trace?.retrievedChunkIds || [];
  const reranked =
    trace?.rerankedContexts || trace?.rerankedChunkIds || retrieved;
  const normalizedRetrieved = retrieved.map((item, index) =>
    normalizeContext(item, index + 1),
  );
  const normalizedReranked = reranked.map((item, index) =>
    normalizeContext(item, index + 1),
  );
  const citations = normalizeCitationProvenance(
    execution?.citations || trace?.citations || [],
    trace,
    normalizedReranked,
  );
  const route = routeDecisionFromTrace(trace);
  const status = execution?.status;
  return {
    schemaVersion: 'rag-eval-result-v1',
    runId,
    caseId: definition.caseId,
    executionStatus:
      status === 'EVALUATED'
        ? 'COMPLETED'
        : status === 'FAILED_RECONCILED'
          ? 'RECONCILED_FAILURE'
          : trace?.providerFailure
            ? 'PROVIDER_FAILURE'
            : 'NO_RESPONSE',
    input: { question: definition.question },
    reference: {
      answer: definition.referenceAnswerText ?? null,
      relevantEvidenceIds: definition.relevantEvidenceIds || [],
      expectedReelIds: definition.reelId ? [definition.reelId] : [],
      expectedIntent: 'REEL_VIDEO_QUESTION',
      expectedEvidenceTypes: [definition.expectedEvidenceType || 'TRANSCRIPT'],
    },
    actual: {
      answer: execution?.finalAnswer ?? trace?.answer ?? null,
      route: {
        ...route,
      },
      retrievedContexts: normalizedRetrieved,
      rerankedContexts: normalizedReranked,
      citations,
    },
    trace: {
      ragTraceId: trace?.traceId || null,
      retryCount: diagnostics.retryCount || 0,
      citationRetryCount: diagnostics.citationRetryCount || 0,
      revisionDepth: diagnostics.revisionDepth || 0,
      routerFallback: Boolean(diagnostics.routerFallback),
      verifierEscalated: Boolean(diagnostics.verifierEscalated),
      finalFailureSource: diagnostics.finalFailureSource || null,
    },
    modelCalls: collectModelCalls(diagnostics),
    latencyMs: execution?.latencyMs ?? trace?.latencyMs ?? null,
  };
}

function main() {
  const definitions = JSON.parse(
    fs.readFileSync(arg('--definitions-report'), 'utf8'),
  );
  const executions = JSON.parse(
    fs.readFileSync(arg('--execution-report'), 'utf8'),
  );
  const traces = arg('--trace-file')
    ? JSON.parse(fs.readFileSync(arg('--trace-file'), 'utf8'))
    : [];
  const definitionsById = new Map(
    definitions.ragBenchmark.cases.map((item) => [item.caseId, item]),
  );
  const traceByCase = new Map(
    traces.map((item) => [item.caseId || item.message, item]),
  );
  const rows = executions.cases.map((execution) => {
    const definition = definitionsById.get(execution.caseId);
    if (!definition) throw new Error(`missing definition ${execution.caseId}`);
    return normalizeCase(
      definition,
      execution,
      traceByCase.get(execution.caseId) ||
        traceByCase.get(definition.question) ||
        null,
      executions.runId,
    );
  });
  const output =
    arg('--output') ||
    path.join(
      path.dirname(arg('--execution-report')),
      `${executions.runId}.normalized.jsonl`,
    );
  fs.writeFileSync(
    output,
    `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
  );
  console.log(output);
}

module.exports = { collectModelCalls, main, normalizeCase, normalizeContext };

if (require.main === module) main();
