import { BackfillReelChunksUseCase } from '@content/application/use-cases/backfill-reel-chunks.use-case';
import { ContentServiceModule } from '@content/content-service.module';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

interface CliOptions {
  batchSize?: number;
  maxReels?: number;
  dryRun?: boolean;
  reelId?: string;
}

const logger = new Logger('BackfillReelChunksJob');

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (const arg of argv) {
    const [rawKey, rawValue] = arg.replace(/^--/, '').split('=');
    const key = rawKey?.trim();
    const value = rawValue?.trim();

    if (!key) {
      continue;
    }

    if (key === 'batchSize' && value) {
      options.batchSize = Number(value);
    }

    if (key === 'maxReels' && value) {
      options.maxReels = Number(value);
    }

    if (key === 'dryRun') {
      options.dryRun = value === undefined ? true : value === 'true';
    }

    if (key === 'reelId' && value) {
      options.reelId = value;
    }
  }

  return options;
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));

  logger.log(
    `Starting ReelChunk backfill with options: ${JSON.stringify(options)}`,
  );

  const app = await NestFactory.createApplicationContext(ContentServiceModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const useCase = app.get(BackfillReelChunksUseCase);
    const result = await useCase.execute(options);

    logger.log(`Backfill completed: ${JSON.stringify(result)}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    logger.error(`Backfill failed: ${message}`);

    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
