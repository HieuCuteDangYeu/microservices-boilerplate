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
    return {
      evidenceId: item,
      reelId: item.includes(':') ? item.split(':')[0] : null,
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

function normalizeCase(definition, execution, trace, runId) {
  const diagnostics = trace?.workflowMetrics?.diagnostics || {};
  const retrieved = trace?.retrievedContexts || trace?.retrievedChunkIds || [];
  const reranked = trace?.rerankedContexts || retrieved;
  const citations = execution?.citations || trace?.citations || [];
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
        intent: trace?.intent ?? null,
        referenceTarget: trace?.referenceTarget ?? null,
        reelQuestionType: trace?.reelQuestionType ?? null,
        requiredEvidence: trace?.requiredEvidence || [],
      },
      retrievedContexts: retrieved.map((item, index) =>
        normalizeContext(item, index + 1),
      ),
      rerankedContexts: reranked.map((item, index) =>
        normalizeContext(item, index + 1),
      ),
      citations,
    },
    trace: {
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
