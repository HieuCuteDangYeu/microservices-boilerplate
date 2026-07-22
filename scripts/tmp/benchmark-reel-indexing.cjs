require('ts-node/register/transpile-only');
require('tsconfig-paths/register');

const { ConfigService } = require('@nestjs/config');
const {
  BuildHierarchicalIndexUseCase,
} = require('../../apps/reel-indexing-service/src/application/use-cases/build-hierarchical-index.use-case');
const {
  BuildTranscriptSectionsUseCase,
} = require('../../apps/reel-indexing-service/src/application/use-cases/build-transcript-sections.use-case');

function buildSegments(durationSeconds) {
  return Array.from(
    { length: Math.ceil(durationSeconds / 10) },
    (_, index) => ({
      start: index * 10,
      end: Math.min(durationSeconds, (index + 1) * 10),
      text: Array.from({ length: 30 }, (__, word) =>
        word === 29 ? `token-${index}-${word}.` : `token-${index}-${word}`,
      ).join(' '),
    }),
  );
}

function benchmark(durationSeconds = 7_200) {
  const config = new ConfigService();
  const segments = buildSegments(durationSeconds);
  const sections = new BuildTranscriptSectionsUseCase(config).execute(
    undefined,
    segments,
  );
  const useCase = new BuildHierarchicalIndexUseCase(config, {}, {});
  const startedAt = process.hrtime.bigint();
  const documents = useCase.buildDocumentDrafts({
    job: {
      jobId: 'benchmark-job',
      reelId: 'benchmark-reel',
      userId: 'benchmark-user',
      mediaAttemptId: 'benchmark-media',
      indexAttemptId: 'benchmark-index',
      indexVersion: 'reel-index-v2',
      mediaKey: 'benchmark/source.mp4',
      sourceDurationMs: durationSeconds * 1_000,
      sourceOrientation: 'LANDSCAPE',
      sourceLengthClass: 'LONG',
      tags: [],
      createdAt: '2026-07-22T00:00:00.000Z',
      schemaVersion: 1,
    },
    metadata: {
      title: 'Synthetic long-video benchmark',
      description: 'Bounded deterministic indexing benchmark',
      tags: ['benchmark'],
    },
    sections,
    transcriptSegments: segments,
  });
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  return {
    durationSeconds,
    transcriptSegments: segments.length,
    sections: documents.filter((document) => document.kind === 'SECTION')
      .length,
    chunks: documents.filter((document) => document.kind === 'CHUNK').length,
    documents: documents.length,
    embeddingBatches: Math.ceil(documents.length / 32),
    elapsedMs: Number(elapsedMs.toFixed(2)),
  };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(benchmark(), null, 2)}\n`);
}

module.exports = { benchmark };
