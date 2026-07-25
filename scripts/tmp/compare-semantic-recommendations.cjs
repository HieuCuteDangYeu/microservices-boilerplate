const { publishRmqMessage } = require('../send-rmq-message.cjs');

async function main() {
  const queryText = process.env.SEMANTIC_QUERY_TEXT?.trim();
  const queryEmbedding = JSON.parse(process.env.SEMANTIC_QUERY_VECTOR || '[]');
  if (!queryText || !Array.isArray(queryEmbedding)) {
    throw new Error(
      'SEMANTIC_QUERY_TEXT and SEMANTIC_QUERY_VECTOR are required',
    );
  }
  const limit = Number(process.env.SEMANTIC_COMPARE_LIMIT || 20);
  const results = await publishRmqMessage({
    queue: 'reel_index_query',
    pattern: 'index.search_reels',
    payload: { queryText, queryEmbedding, limit },
  });
  console.log(
    JSON.stringify(
      { candidateCount: Array.isArray(results) ? results.length : 0 },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
