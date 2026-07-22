require('dotenv').config({ quiet: true });

const { PrismaClient } = require('@prisma/reel-indexing-client');

const EXPECTED_TABLES = [
  'ReelDocument',
  'ReelSection',
  'ReelChunk',
  'TranscriptionSegment',
  'IndexingAttempt',
];
const EXPECTED_INDEXES = [
  'ReelDocument_embedding_hnsw_idx',
  'ReelSection_embedding_hnsw_idx',
  'ReelChunk_embedding_hnsw_idx',
  'ReelDocument_searchVector_gin_idx',
  'ReelSection_searchVector_gin_idx',
  'ReelChunk_searchVector_gin_idx',
];

function parseVersion(version) {
  return String(version)
    .split(/[.-]/)
    .slice(0, 3)
    .map((value) => Number(value) || 0);
}

function supportsIterativeScan(version) {
  const [major = 0, minor = 0] = parseVersion(version);
  return major > 0 || (major === 0 && minor >= 8);
}

async function verifySemanticIndex(prisma = new PrismaClient()) {
  const ownsClient = arguments.length === 0;
  try {
    const extension = await prisma.$queryRawUnsafe(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'",
    );
    const version = extension[0]?.extversion;
    if (!version || !supportsIterativeScan(version)) {
      throw new Error(`pgvector >= 0.8.0 required; found ${version || 'none'}`);
    }

    const tables = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = current_schema() AND tablename = ANY($1::text[])
       ORDER BY tablename`,
      EXPECTED_TABLES,
    );
    const indexes = await prisma.$queryRawUnsafe(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = ANY($1::text[])
       ORDER BY indexname`,
      EXPECTED_INDEXES,
    );
    const storedVectors = await prisma.$queryRawUnsafe(
      `SELECT table_name AS "tableName", is_generated AS "isGenerated"
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND column_name = 'searchVector'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      ['ReelDocument', 'ReelSection', 'ReelChunk'],
    );
    const counts = await prisma.$queryRawUnsafe(
      `SELECT
        (SELECT count(*)::int FROM "ReelDocument" WHERE "isActive") AS reels,
        (SELECT count(*)::int FROM "ReelSection" WHERE "isActive") AS sections,
        (SELECT count(*)::int FROM "ReelChunk" WHERE "isActive") AS chunks`,
    );

    const missingTables = EXPECTED_TABLES.filter(
      (name) => !tables.some((row) => row.tablename === name),
    );
    const missingIndexes = EXPECTED_INDEXES.filter(
      (name) => !indexes.some((row) => row.indexname === name),
    );
    const invalidStoredColumns = storedVectors.filter(
      (row) => row.isGenerated !== 'ALWAYS',
    );
    if (
      missingTables.length ||
      missingIndexes.length ||
      invalidStoredColumns.length
    ) {
      throw new Error(
        `Semantic schema incomplete: tables=${missingTables.join(',') || 'ok'} ` +
          `indexes=${missingIndexes.join(',') || 'ok'} storedVectors=${
            invalidStoredColumns.map((row) => row.tableName).join(',') || 'ok'
          }`,
      );
    }
    return {
      pgvectorVersion: version,
      tables: tables.map((row) => row.tablename),
      indexes: indexes.map((row) => row.indexname),
      storedSearchVectors: storedVectors.map((row) => row.tableName),
      activeRows: counts[0],
    };
  } finally {
    if (ownsClient) await prisma.$disconnect();
  }
}

if (require.main === module) {
  verifySemanticIndex()
    .then((result) =>
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    )
    .catch((error) => {
      process.stderr.write(
        `Semantic index verification failed: ${error.message}\n`,
      );
      process.exitCode = 1;
    });
}

module.exports = { parseVersion, supportsIterativeScan, verifySemanticIndex };
