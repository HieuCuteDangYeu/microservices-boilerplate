import { RagTrace } from '@ai/domain/entities/rag-trace.entity';
import type { RagCitation } from '@ai/domain/interfaces/rag-chat-workflow.interface';
import type {
  IRagTraceRepository,
  RagTraceCreateInput,
} from '@ai/domain/interfaces/rag-trace.repository.interface';
import { PrismaService } from '@ai/infrastructure/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma, RagTrace as PrismaRagTrace } from '@prisma/ai-client';

@Injectable()
export class PrismaRagTraceRepository implements IRagTraceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: RagTraceCreateInput): Promise<RagTrace> {
    const saved = await this.prisma.ragTrace.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        message: input.message,

        intent: input.intent,
        needsRetrieval: input.needsRetrieval ?? false,

        retrievedChunkIds: this.toJsonStringArray(
          input.retrievedChunkIds ?? [],
        ),
        rerankedChunkIds: this.toJsonStringArray(input.rerankedChunkIds ?? []),
        citations: this.toJsonCitations(input.citations ?? []),

        answer: input.answer,
        verifierPassed: input.verifierPassed,
        verifierConfidence: input.verifierConfidence,
        verifierIssues: this.toJsonStringArray(input.verifierIssues ?? []),

        latencyMs: input.latencyMs,
        nodeTimings: this.toJsonNumberRecord(input.nodeTimings ?? {}),
      },
    });

    return this.toDomain(saved);
  }

  private toDomain(record: PrismaRagTrace): RagTrace {
    return new RagTrace({
      id: record.id,

      userId: record.userId,
      conversationId: record.conversationId,
      message: record.message,

      intent: record.intent ?? undefined,
      needsRetrieval: record.needsRetrieval,

      retrievedChunkIds: this.fromJsonStringArray(record.retrievedChunkIds),
      rerankedChunkIds: this.fromJsonStringArray(record.rerankedChunkIds),
      citations: this.fromJsonCitations(record.citations),

      answer: record.answer ?? undefined,
      verifierPassed: record.verifierPassed ?? undefined,
      verifierConfidence: record.verifierConfidence ?? undefined,
      verifierIssues: this.fromJsonStringArray(record.verifierIssues),

      latencyMs: record.latencyMs ?? undefined,
      nodeTimings: this.fromJsonNumberRecord(record.nodeTimings),

      createdAt: record.createdAt,
    });
  }

  private toJsonStringArray(value: string[]): Prisma.InputJsonValue {
    const jsonArray: Prisma.InputJsonValue[] = value.map((item) => item);

    return jsonArray;
  }

  private toJsonCitations(value: RagCitation[]): Prisma.InputJsonValue {
    const jsonArray: Prisma.InputJsonObject[] = value.map((citation) => ({
      sourceType: citation.sourceType,
      title: citation.title ?? null,
      startTime: citation.startTime ?? null,
      endTime: citation.endTime ?? null,
      quote: citation.quote ?? null,
    }));

    return jsonArray;
  }

  private toJsonNumberRecord(
    value: Record<string, number>,
  ): Prisma.InputJsonValue {
    const entries: Array<[string, Prisma.InputJsonValue]> = Object.entries(
      value,
    ).map(([key, item]) => [key, item]);

    return Object.fromEntries(entries);
  }

  private fromJsonStringArray(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private fromJsonCitations(value: Prisma.JsonValue | null): RagCitation[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const citations: RagCitation[] = [];

    for (const item of value) {
      if (!this.isJsonObject(item)) {
        continue;
      }

      citations.push({
        sourceType: 'REEL',
        title: this.readJsonString(item, 'title'),
        startTime: this.readJsonNumber(item, 'startTime'),
        endTime: this.readJsonNumber(item, 'endTime'),
        quote: this.readJsonString(item, 'quote'),
      });
    }

    return citations;
  }

  private fromJsonNumberRecord(
    value: Prisma.JsonValue | null,
  ): Record<string, number> {
    if (!this.isJsonObject(value)) {
      return {};
    }

    const result: Record<string, number> = {};

    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'number' && Number.isFinite(item)) {
        result[key] = item;
      }
    }

    return result;
  }

  private isJsonObject(
    value: Prisma.JsonValue | null | undefined,
  ): value is Prisma.JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private readJsonString(
    value: Prisma.JsonObject,
    key: string,
  ): string | undefined {
    const item = value[key];

    if (typeof item !== 'string') {
      return undefined;
    }

    const trimmed = item.trim();

    return trimmed ? trimmed : undefined;
  }

  private readJsonNumber(
    value: Prisma.JsonObject,
    key: string,
  ): number | undefined {
    const item = value[key];

    if (typeof item !== 'number' || !Number.isFinite(item)) {
      return undefined;
    }

    return item;
  }
}
