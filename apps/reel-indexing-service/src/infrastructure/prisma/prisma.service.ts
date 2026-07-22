import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/reel-indexing-client';

interface ExtensionVersionRow {
  extversion: string;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
    const rows = await this.$queryRaw<ExtensionVersionRow[]>`
      SELECT extversion FROM pg_extension WHERE extname = 'vector'
    `;
    const version = rows[0]?.extversion;
    if (!version || !isSupportedPgvector(version)) {
      throw new Error(
        `Reel Indexing Service requires pgvector >= 0.8.0; found ${version ?? 'not installed'}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

function isSupportedPgvector(version: string): boolean {
  const [major = 0, minor = 0, patch = 0] = version
    .split(/[.-]/)
    .slice(0, 3)
    .map((value) => Number(value));
  return (
    major > 0 ||
    (major === 0 && minor > 8) ||
    (major === 0 && minor === 8 && patch >= 0)
  );
}
