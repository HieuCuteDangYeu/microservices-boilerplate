require('dotenv').config({ quiet: true });
require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

const { ConfigService } = require('@nestjs/config');
const {
  PrismaService,
} = require('../../apps/reel-indexing-service/src/infrastructure/prisma/prisma.service');
const {
  PrismaSemanticIndexRepository,
} = require('../../apps/reel-indexing-service/src/infrastructure/repositories/prisma-semantic-index.repository');

const REEL_ID = 'phase8-semantic-long-reel';
const ATTEMPT_ID = 'phase8-semantic-attempt';
const REEL_DOCUMENT_ID = 'phase8-reel-document';

function embedding(seed) {
  const values = Array.from(
    { length: 384 },
    (_, index) => ((index + seed) % 23) + 1,
  );
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );
  return values.map((value) => value / magnitude);
}

function document(kind, id, ordinal, text, seed, parentId, startTime, endTime) {
  return {
    id,
    reelId: REEL_ID,
    kind,
    ordinal,
    parentId,
    text,
    startTime,
    endTime,
    embedding: embedding(seed),
    embeddingProvider: 'phase8-local',
    embeddingModel: 'deterministic-fixture',
    embeddingDimensions: 384,
    embeddingVersion: 'phase8-v1',
    embeddingInputHash: `phase8-${kind.toLowerCase()}-${ordinal}`,
    indexVersion: 'reel-index-v2',
    chunkingVersion: 'hierarchical-v1',
    summaryVersion: 'summary-v1',
  };
}

async function main() {
  if (!process.env.REEL_INDEXING_DATABASE_URL) {
    throw new Error('REEL_INDEXING_DATABASE_URL is required.');
  }

  const prisma = new PrismaService();
  const repository = new PrismaSemanticIndexRepository(
    prisma,
    new ConfigService(),
  );

  try {
    await prisma.onModuleInit();
    await repository.deleteReel(REEL_ID);

    if (process.argv.includes('--cleanup')) {
      process.stdout.write(
        `${JSON.stringify({ cleaned: true, reelId: REEL_ID })}\n`,
      );
      return;
    }

    await prisma.indexingAttempt.create({
      data: {
        indexAttemptId: ATTEMPT_ID,
        jobId: 'phase8-semantic-job',
        reelId: REEL_ID,
        mediaAttemptId: 'phase8-media-attempt',
        indexVersion: 'reel-index-v2',
        status: 'PROCESSING',
        stage: 'PERSISTING',
      },
    });

    const documents = [
      document(
        'REEL',
        REEL_DOCUMENT_ID,
        0,
        'A long travel documentary covering mountain preparation and coastal navigation.',
        1,
      ),
      document(
        'SECTION',
        'phase8-section-mountain',
        0,
        'Mountain preparation, safety equipment, and route planning.',
        2,
        REEL_DOCUMENT_ID,
        0,
        300,
      ),
      document(
        'SECTION',
        'phase8-section-coast',
        1,
        'Coastal navigation, weather changes, and safe harbor selection.',
        17,
        REEL_DOCUMENT_ID,
        300,
        600,
      ),
      document(
        'CHUNK',
        'phase8-chunk-mountain',
        0,
        'The mountain section recommends checking weather and carrying safety equipment.',
        2,
        'phase8-section-mountain',
        40,
        70,
      ),
      document(
        'CHUNK',
        'phase8-chunk-coast',
        1,
        'The coastal section explains navigation and choosing a safe harbor.',
        17,
        'phase8-section-coast',
        410,
        440,
      ),
    ];

    await repository.persistCandidate({
      job: {
        jobId: 'phase8-semantic-job',
        reelId: REEL_ID,
        userId: 'phase8-viewer',
        mediaAttemptId: 'phase8-media-attempt',
        indexAttemptId: ATTEMPT_ID,
        indexVersion: 'reel-index-v2',
        mediaKey: 'phase8/fixture/master.m3u8',
        sourceDurationMs: 600_000,
        sourceOrientation: 'LANDSCAPE',
        sourceLengthClass: 'LONG',
        tags: ['travel', 'navigation', 'mountains'],
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
      },
      metadata: {
        title: 'Phase 8 long-video semantic fixture',
        description: 'Disposable local semantic validation fixture.',
        tags: ['travel', 'navigation', 'mountains'],
      },
      documents,
    });
    await repository.activateCandidate(REEL_ID, ATTEMPT_ID);

    const reelResults = await repository.searchReels({
      queryEmbedding: embedding(1),
      queryText: 'travel documentary',
      queryTags: ['travel'],
      limit: 5,
    });
    const sectionResults = await repository.searchSections({
      queryEmbedding: embedding(17),
      queryText: 'coastal navigation',
      filters: { reelIds: [REEL_ID] },
      limit: 5,
    });
    const chunkResults = await repository.searchChunks({
      queryEmbedding: embedding(17),
      queryText: 'safe harbor',
      filters: { parentIds: ['phase8-section-coast'] },
      limit: 5,
    });

    if (
      reelResults[0]?.reelId !== REEL_ID ||
      sectionResults[0]?.id !== 'phase8-section-coast' ||
      chunkResults[0]?.id !== 'phase8-chunk-coast'
    ) {
      throw new Error(
        'Hierarchical semantic fixture did not rank as expected.',
      );
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          seeded: true,
          reelId: REEL_ID,
          documents: documents.length,
          topReelId: reelResults[0].reelId,
          topSectionId: sectionResults[0].id,
          topChunkId: chunkResults[0].id,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await prisma.onModuleDestroy();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `Phase 8 semantic seed failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
