const { publishRmqMessage } = require('../send-rmq-message.cjs');

async function main() {
  const query = process.env.SEMANTIC_QUERY_TEXT?.trim();
  if (!query) throw new Error('SEMANTIC_QUERY_TEXT is required');
  const limit = Number(process.env.SEMANTIC_COMPARE_LIMIT || 10);
  const legacy = await publishRmqMessage({
    queue: 'content_queue',
    pattern: 'content.search_reels',
    payload: { query, limit },
  });
  const indexing = await publishRmqMessage({
    queue: 'reel_index_query',
    pattern: 'index.search_reels',
    payload: { queryText: query, limit },
  });
  const legacyIds = new Set((legacy || []).map((item) => item.id));
  const indexingIds = new Set((indexing || []).map((item) => item.reelId));
  const shared = [...legacyIds].filter((id) => indexingIds.has(id)).length;
  console.log(
    JSON.stringify(
      {
        legacyResults: legacyIds.size,
        indexingResults: indexingIds.size,
        overlap: shared,
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
