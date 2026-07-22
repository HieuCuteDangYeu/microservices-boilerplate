require('dotenv').config({ quiet: true });

const { PrismaClient } = require('@prisma/reel-indexing-client');

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)
  ];
}

function recallAtK(exactIds, approximateIds) {
  if (!exactIds.length) return 1;
  const approximate = new Set(approximateIds);
  return exactIds.filter((id) => approximate.has(id)).length / exactIds.length;
}

async function benchmarkSemanticIndex({ iterations = 20, k = 20 } = {}) {
  const prisma = new PrismaClient();
  const cases = [
    {
      name: 'short Reel search',
      table: 'ReelDocument',
      predicate: 'AND "sourceLengthClass" = \'SHORT\'',
    },
    {
      name: 'long Reel document search',
      table: 'ReelDocument',
      predicate: 'AND "sourceLengthClass" = \'LONG\'',
    },
    {
      name: 'long-video section search',
      table: 'ReelSection',
      predicate: 'AND "sourceLengthClass" = \'LONG\'',
    },
    { name: 'precise chunk search', table: 'ReelChunk', predicate: '' },
  ];
  try {
    const results = [];
    for (const definition of cases) {
      results.push(await benchmarkCase(prisma, definition, iterations, k));
    }
    const filteredSample = await sampleRow(prisma, 'ReelDocument', '');
    results.push(
      filteredSample
        ? await benchmarkCase(
            prisma,
            {
              name: 'filtered retrieval',
              table: 'ReelDocument',
              predicate: `AND "userId" = '${sqlLiteral(filteredSample.userId)}'`,
              sample: filteredSample,
            },
            iterations,
            k,
          )
        : { name: 'filtered retrieval', skipped: 'no active Reel document' },
    );
    const sizes = await prisma.$queryRawUnsafe(
      `SELECT relname AS table,
        pg_relation_size(oid)::bigint::text AS "tableBytes",
        pg_indexes_size(oid)::bigint::text AS "indexBytes"
       FROM pg_class WHERE relname = ANY($1::text[]) ORDER BY relname`,
      ['ReelDocument', 'ReelSection', 'ReelChunk'],
    );
    return { iterations, k, results, indexSize: sizes };
  } finally {
    await prisma.$disconnect();
  }
}

async function benchmarkCase(prisma, definition, iterations, k) {
  const sample =
    definition.sample ||
    (await sampleRow(prisma, definition.table, definition.predicate));
  if (!sample)
    return { name: definition.name, skipped: 'no matching active rows' };
  const exact = await exactSearch(
    prisma,
    definition.table,
    definition.predicate,
    sample.embedding,
    k,
  );
  const latencies = [];
  let approximate = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = process.hrtime.bigint();
    approximate = await annSearch(
      prisma,
      definition.table,
      definition.predicate,
      sample.embedding,
      k,
    );
    latencies.push(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
  }
  return {
    name: definition.name,
    table: definition.table,
    matchedRows: approximate.length,
    recallAtK: Number(recallAtK(exact, approximate).toFixed(4)),
    p50Ms: Number(percentile(latencies, 0.5).toFixed(2)),
    p95Ms: Number(percentile(latencies, 0.95).toFixed(2)),
  };
}

async function sampleRow(prisma, table, predicate) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT "embedding"::text AS embedding, "userId" FROM "${table}"
     WHERE "isActive" ${predicate} ORDER BY "rowId" LIMIT 1`,
  );
  return rows[0];
}

async function exactSearch(prisma, table, predicate, embedding, k) {
  return await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe('SET LOCAL enable_indexscan = off');
    await transaction.$executeRawUnsafe('SET LOCAL enable_bitmapscan = off');
    const rows = await transaction.$queryRawUnsafe(
      `SELECT "id" FROM "${table}" WHERE "isActive" ${predicate}
       ORDER BY "embedding" <=> $1::vector LIMIT ${positiveInt(k, 20)}`,
      embedding,
    );
    return rows.map((row) => row.id);
  });
}

async function annSearch(prisma, table, predicate, embedding, k) {
  return await prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `SET LOCAL hnsw.ef_search = ${positiveInt(process.env.INDEX_HNSW_EF_SEARCH, 100)}`,
    );
    await transaction.$executeRawUnsafe(
      "SET LOCAL hnsw.iterative_scan = 'strict_order'",
    );
    await transaction.$executeRawUnsafe(
      `SET LOCAL hnsw.max_scan_tuples = ${positiveInt(process.env.INDEX_HNSW_MAX_SCAN_TUPLES, 20000)}`,
    );
    const rows = await transaction.$queryRawUnsafe(
      `SELECT "id" FROM "${table}" WHERE "isActive" ${predicate}
       ORDER BY "embedding" <=> $1::vector LIMIT ${positiveInt(k, 20)}`,
      embedding,
    );
    return rows.map((row) => row.id);
  });
}

function positiveInt(value, fallback) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}

if (require.main === module) {
  benchmarkSemanticIndex()
    .then((result) =>
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    )
    .catch((error) => {
      process.stderr.write(
        `Semantic index benchmark failed: ${error.message}\n`,
      );
      process.exitCode = 1;
    });
}

module.exports = { benchmarkSemanticIndex, percentile, recallAtK };
