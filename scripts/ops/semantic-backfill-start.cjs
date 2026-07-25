const { publishRmqMessage } = require('../send-rmq-message.cjs');

async function main() {
  const pageLimit = Number(process.env.SEMANTIC_BACKFILL_PAGE_LIMIT || 25);
  const maxPages = Number(process.env.SEMANTIC_BACKFILL_MAX_PAGES || 1);
  let cursor = process.env.SEMANTIC_BACKFILL_CURSOR || undefined;
  let importedReels = 0;
  let skippedReels = 0;

  if (!Number.isInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
    throw new Error(
      'SEMANTIC_BACKFILL_PAGE_LIMIT must be an integer from 1 to 100',
    );
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1_000) {
    throw new Error(
      'SEMANTIC_BACKFILL_MAX_PAGES must be an integer from 1 to 1000',
    );
  }

  for (let page = 0; page < maxPages; page += 1) {
    const source = await publishRmqMessage({
      queue: 'content_queue',
      pattern: 'content.list_legacy_semantic_reels',
      payload: { cursor, limit: pageLimit },
    });
    if (!Array.isArray(source.items) || source.items.length === 0) break;

    const result = await publishRmqMessage({
      queue: 'reel_index_query',
      pattern: 'index.import_legacy_semantic_reels',
      payload: { items: source.items },
    });
    importedReels += Number(result.importedReels) || 0;
    skippedReels += Number(result.skippedReels) || 0;
    cursor =
      typeof source.nextCursor === 'string' ? source.nextCursor : undefined;
    if (!cursor) break;
  }

  console.log(
    JSON.stringify({ importedReels, skippedReels, nextCursor: cursor }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
