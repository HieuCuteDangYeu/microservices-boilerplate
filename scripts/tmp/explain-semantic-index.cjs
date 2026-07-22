require('dotenv').config({ quiet: true });

const { PrismaClient } = require('@prisma/reel-indexing-client');

const TABLES = new Set(['ReelDocument', 'ReelSection', 'ReelChunk']);

async function explainSemanticIndex({
  table = process.env.SEMANTIC_INDEX_TABLE || 'ReelDocument',
  queryText = process.argv.slice(2).find((value) => value !== '--') ||
    'semantic retrieval',
} = {}) {
  if (!TABLES.has(table))
    throw new Error(`Unsupported semantic table ${table}`);
  const prisma = new PrismaClient();
  try {
    const sample = await prisma.$queryRawUnsafe(
      `SELECT embedding::text AS embedding FROM "${table}"
       WHERE "isActive" ORDER BY "rowId" LIMIT 1`,
    );
    const fallback = Array.from({ length: 384 }, (_, index) =>
      index === 0 ? 1 : 0,
    );
    const embedding = sample[0]?.embedding || `[${fallback.join(',')}]`;
    return await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      await transaction.$executeRawUnsafe('SET LOCAL enable_bitmapscan = off');
      await transaction.$executeRawUnsafe(
        `SET LOCAL hnsw.ef_search = ${positiveInt(process.env.INDEX_HNSW_EF_SEARCH, 100)}`,
      );
      await transaction.$executeRawUnsafe(
        "SET LOCAL hnsw.iterative_scan = 'strict_order'",
      );
      const vectorPlan = await transaction.$queryRawUnsafe(
        `EXPLAIN (FORMAT JSON) SELECT "id" FROM "${table}"
         WHERE "isActive" ORDER BY "embedding" <=> $1::vector LIMIT 20`,
        embedding,
      );
      await transaction.$executeRawUnsafe('SET LOCAL enable_bitmapscan = on');
      const keywordPlan = await transaction.$queryRawUnsafe(
        `EXPLAIN (FORMAT JSON) SELECT "id" FROM "${table}"
         WHERE "searchVector" @@ websearch_to_tsquery('simple', $1)
         ORDER BY ts_rank_cd("searchVector", websearch_to_tsquery('simple', $1)) DESC
         LIMIT 20`,
        queryText,
      );
      return { table, queryText, vectorPlan, keywordPlan };
    });
  } finally {
    await prisma.$disconnect();
  }
}

function positiveInt(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (require.main === module) {
  explainSemanticIndex()
    .then((result) =>
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    )
    .catch((error) => {
      process.stderr.write(`Semantic index EXPLAIN failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { explainSemanticIndex };
