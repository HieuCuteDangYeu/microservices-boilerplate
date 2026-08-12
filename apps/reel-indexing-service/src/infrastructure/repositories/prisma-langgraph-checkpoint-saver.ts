import { PrismaService } from '@indexing/infrastructure/prisma/prisma.service';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
} from '@langchain/langgraph';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/reel-indexing-client';

interface CheckpointRow {
  threadId: string;
  checkpointNamespace: string;
  checkpointId: string;
  parentCheckpointId: string | null;
  checkpointType: string;
  checkpoint: Buffer;
  metadataType: string;
  metadata: Buffer;
}

interface CheckpointWriteRow {
  taskId: string;
  writeIndex: number;
  channel: string;
  valueType: string;
  value: Buffer;
}

type PendingWrite = [channel: string, value: unknown];
interface CheckpointListOptions {
  limit?: number;
  before?: RunnableConfig;
  filter?: Record<string, unknown>;
}

const SPECIAL_WRITE_INDEX: Record<string, number> = {
  __error__: -1,
  __scheduled__: -2,
  __interrupt__: -3,
  __resume__: -4,
};

// The graph topology changed materially (parallel visual/transcript branches,
// quality gates, and a new commit node). Namespace persisted LangGraph state so
// in-flight checkpoints created by the previous topology are never resumed as
// if they belonged to this graph. Domain indexing checkpoints remain reusable.
const CHECKPOINT_THREAD_VERSION = 'reel-index-v2';

@Injectable()
export class PrismaLangGraphCheckpointSaver extends BaseCheckpointSaver {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { threadId, checkpointNamespace, checkpointId } =
      this.checkpointConfig(config);
    const rows = checkpointId
      ? await this.prisma.$queryRaw<CheckpointRow[]>(Prisma.sql`
          SELECT "threadId", "checkpointNamespace", "checkpointId",
            "parentCheckpointId", "checkpointType", "checkpoint",
            "metadataType", "metadata"
          FROM "LangGraphCheckpoint"
          WHERE "threadId" = ${threadId}
            AND "checkpointNamespace" = ${checkpointNamespace}
            AND "checkpointId" = ${checkpointId}
          LIMIT 1
        `)
      : await this.prisma.$queryRaw<CheckpointRow[]>(Prisma.sql`
          SELECT "threadId", "checkpointNamespace", "checkpointId",
            "parentCheckpointId", "checkpointType", "checkpoint",
            "metadataType", "metadata"
          FROM "LangGraphCheckpoint"
          WHERE "threadId" = ${threadId}
            AND "checkpointNamespace" = ${checkpointNamespace}
          ORDER BY "createdAt" DESC, "checkpointId" DESC
          LIMIT 1
        `);
    const record = rows[0];
    if (!record) return undefined;

    const pendingWrites = await this.prisma.$queryRaw<CheckpointWriteRow[]>(
      Prisma.sql`
        SELECT "taskId", "writeIndex", "channel", "valueType", "value"
        FROM "LangGraphCheckpointWrite"
        WHERE "threadId" = ${threadId}
          AND "checkpointNamespace" = ${checkpointNamespace}
          AND "checkpointId" = ${record.checkpointId}
        ORDER BY "taskId", "writeIndex"
      `,
    );
    const tuple: CheckpointTuple = {
      config: this.toConfig(
        record.threadId,
        record.checkpointNamespace,
        record.checkpointId,
      ),
      checkpoint: (await this.serde.loadsTyped(
        record.checkpointType,
        record.checkpoint,
      )) as Checkpoint,
      metadata: (await this.serde.loadsTyped(
        record.metadataType,
        record.metadata,
      )) as CheckpointMetadata,
      pendingWrites: await Promise.all(
        pendingWrites.map(async (write) => [
          write.taskId,
          write.channel,
          await this.serde.loadsTyped(write.valueType, write.value),
        ]),
      ),
    };
    if (record.parentCheckpointId) {
      tuple.parentConfig = this.toConfig(
        record.threadId,
        record.checkpointNamespace,
        record.parentCheckpointId,
      );
    }
    return tuple;
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const { threadId, checkpointNamespace, checkpointId } =
      this.checkpointConfig(config);
    const beforeConfig = options?.before?.configurable as
      | Record<string, unknown>
      | undefined;
    const before = beforeConfig?.['checkpoint_id'];
    const limit =
      options?.limit !== undefined
        ? Math.max(0, Math.min(1_000, options.limit))
        : 1_000;
    const rows = await this.prisma.$queryRaw<CheckpointRow[]>(Prisma.sql`
      SELECT "threadId", "checkpointNamespace", "checkpointId",
        "parentCheckpointId", "checkpointType", "checkpoint",
        "metadataType", "metadata"
      FROM "LangGraphCheckpoint"
      WHERE "threadId" = ${threadId}
        AND "checkpointNamespace" = ${checkpointNamespace}
        ${checkpointId ? Prisma.sql`AND "checkpointId" = ${checkpointId}` : Prisma.empty}
        ${
          typeof before === 'string'
            ? Prisma.sql`AND "checkpointId" < ${before}`
            : Prisma.empty
        }
      ORDER BY "createdAt" DESC, "checkpointId" DESC
      LIMIT ${limit}
    `);
    for (const record of rows) {
      const tuple = await this.getTuple(
        this.toConfig(
          record.threadId,
          record.checkpointNamespace,
          record.checkpointId,
        ),
      );
      if (!tuple) continue;
      if (
        options?.filter &&
        !Object.entries(options.filter).every(
          ([key, value]) =>
            (tuple.metadata as Record<string, unknown> | undefined)?.[key] ===
            value,
        )
      ) {
        continue;
      }
      yield tuple;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const { threadId, checkpointNamespace, checkpointId } =
      this.checkpointConfig(config);
    const [[checkpointType, checkpointValue], [metadataType, metadataValue]] =
      await Promise.all([
        this.serde.dumpsTyped(checkpoint),
        this.serde.dumpsTyped(metadata),
      ]);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "LangGraphCheckpoint" (
        "threadId", "checkpointNamespace", "checkpointId",
        "parentCheckpointId", "checkpointType", "checkpoint",
        "metadataType", "metadata"
      ) VALUES (
        ${threadId}, ${checkpointNamespace}, ${checkpoint.id},
        ${checkpointId ?? null}, ${checkpointType}, ${Buffer.from(checkpointValue)},
        ${metadataType}, ${Buffer.from(metadataValue)}
      )
      ON CONFLICT ("threadId", "checkpointNamespace", "checkpointId")
      DO UPDATE SET
        "parentCheckpointId" = EXCLUDED."parentCheckpointId",
        "checkpointType" = EXCLUDED."checkpointType",
        "checkpoint" = EXCLUDED."checkpoint",
        "metadataType" = EXCLUDED."metadataType",
        "metadata" = EXCLUDED."metadata"
    `);
    return this.toConfig(threadId, checkpointNamespace, checkpoint.id);
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const { threadId, checkpointNamespace, checkpointId } =
      this.checkpointConfig(config);
    if (!checkpointId) {
      throw new Error('LangGraph checkpoint writes require checkpoint_id');
    }
    for (const [index, [channel, value]] of writes.entries()) {
      const writeIndex = SPECIAL_WRITE_INDEX[channel] ?? index;
      const [valueType, serialized] = await this.serde.dumpsTyped(value);
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "LangGraphCheckpointWrite" (
          "threadId", "checkpointNamespace", "checkpointId", "taskId",
          "writeIndex", "channel", "valueType", "value"
        ) VALUES (
          ${threadId}, ${checkpointNamespace}, ${checkpointId}, ${taskId},
          ${writeIndex}, ${channel}, ${valueType}, ${Buffer.from(serialized)}
        )
        ON CONFLICT (
          "threadId", "checkpointNamespace", "checkpointId", "taskId",
          "writeIndex"
        ) DO UPDATE SET
          "channel" = EXCLUDED."channel",
          "valueType" = EXCLUDED."valueType",
          "value" = EXCLUDED."value"
      `);
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    const storageThreadId = this.versionThreadId(threadId);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM "LangGraphCheckpointWrite"
        WHERE "threadId" = ${storageThreadId}
      `);
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM "LangGraphCheckpoint"
        WHERE "threadId" = ${storageThreadId}
      `);
    });
  }

  private checkpointConfig(config: RunnableConfig): {
    threadId: string;
    checkpointNamespace: string;
    checkpointId?: string;
  } {
    const configurable = config.configurable as
      | Record<string, unknown>
      | undefined;
    const threadId = configurable?.['thread_id'];
    const checkpointNamespace = configurable?.['checkpoint_ns'] ?? '';
    const checkpointId = configurable?.['checkpoint_id'];
    if (typeof threadId !== 'string' || !threadId.trim()) {
      throw new Error('LangGraph checkpoint config requires thread_id');
    }
    if (
      typeof checkpointNamespace !== 'string' ||
      (checkpointId !== undefined && typeof checkpointId !== 'string')
    ) {
      throw new Error('LangGraph checkpoint config is invalid');
    }
    return {
      threadId: this.versionThreadId(threadId),
      checkpointNamespace,
      checkpointId,
    };
  }

  private versionThreadId(threadId: string): string {
    const clean = threadId.trim();
    const prefix = `${CHECKPOINT_THREAD_VERSION}:`;
    return clean.startsWith(prefix) ? clean : `${prefix}${clean}`;
  }

  private toConfig(
    threadId: string,
    checkpointNamespace: string,
    checkpointId: string,
  ): RunnableConfig {
    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNamespace,
        checkpoint_id: checkpointId,
      },
    };
  }
}
