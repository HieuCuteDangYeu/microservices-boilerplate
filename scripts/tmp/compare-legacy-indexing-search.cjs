const { publishRmqMessage } = require('../send-rmq-message.cjs');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function overlap(left, right) {
  const rightIds = new Set(right);
  return left.filter((id) => rightIds.has(id)).length;
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function evidenceKey(item, text) {
  return [
    item.reelId,
    normalizeText(text),
    item.startTime ?? '',
    item.endTime ?? '',
  ].join('|');
}

async function main() {
  const queryText = required('SEMANTIC_QUERY_TEXT');
  const queryVector = JSON.parse(required('SEMANTIC_QUERY_VECTOR'));
  const userId = required('SEMANTIC_USER_ID');
  const conversationId = required('SEMANTIC_CONVERSATION_ID');
  const limit = Number(process.env.SEMANTIC_COMPARE_LIMIT || 10);
  const startedLegacy = Date.now();
  const legacy = await publishRmqMessage({
    queue: 'content_queue',
    pattern: 'content.search_reel_context',
    payload: {
      queryText,
      queryVector,
      userId,
      conversationId,
      sharedOnly: true,
      limit,
    },
  });
  const startedIndex = Date.now();
  const eligible = await publishRmqMessage({
    queue: 'content_queue',
    pattern: 'content.resolve_reel_context_access',
    payload: { userId, conversationId },
  });
  const indexing = await publishRmqMessage({
    queue: 'reel_index_query',
    pattern: 'index.search_chunks',
    payload: {
      queryText,
      queryEmbedding: queryVector,
      filters: { reelIds: eligible.reelIds || [] },
      limit,
    },
  });
  const legacyItems = Array.isArray(legacy) ? legacy : [];
  const indexingItems = Array.isArray(indexing) ? indexing : [];
  const legacyReelIds = legacyItems.map((item) => item.reelId);
  const indexingReelIds = indexingItems.map((item) => item.reelId);
  const legacyEvidence = legacyItems.map((item) =>
    evidenceKey(item, item.chunkText),
  );
  const indexingEvidence = indexingItems.map((item) =>
    evidenceKey(item, item.text),
  );
  const evidenceOverlap = overlap(legacyEvidence, indexingEvidence);
  console.log(
    JSON.stringify(
      {
        requestedLimit: limit,
        legacyResultCount: legacyItems.length,
        indexingResultCount: indexingItems.length,
        reelOverlap: overlap(legacyReelIds, indexingReelIds),
        evidenceOverlap,
        evidenceRecallAtK: legacyEvidence.length
          ? evidenceOverlap / legacyEvidence.length
          : null,
        legacyLatencyMs: startedIndex - startedLegacy,
        indexingLatencyMs: Date.now() - startedIndex,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
