import type { IEmbeddingService } from '@ai/domain/interfaces/embedding.service.interface';
import type {
  IUserMemoryRepository,
  UserMemoryUpsertInput,
} from '@ai/domain/interfaces/user-memory.repository.interface';
import type { ExtractedUserMemoryCandidate } from '@common/ai/interfaces/extract-user-memory.interface';
import type { UserMemoryType } from '@common/ai/interfaces/user-memory.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UpsertUserMemoriesUseCase {
  private readonly logger = new Logger(UpsertUserMemoriesUseCase.name);

  private readonly minConfidence = 0.65;
  private readonly minContentLength = 16;
  private readonly minEvidenceLength = 4;

  private readonly allowedTypes = new Set<UserMemoryType>([
    'PREFERENCE',
    'PROFILE',
    'TECHNICAL_CONTEXT',
    'COMMUNICATION_STYLE',
    'OTHER',
  ]);

  constructor(
    private readonly configService: ConfigService,

    @Inject('IUserMemoryRepository')
    private readonly userMemoryRepository: IUserMemoryRepository,

    @Inject('IEmbeddingService')
    private readonly embeddingService: IEmbeddingService,
  ) {}

  async execute(input: {
    userId: string;
    conversationId: string;
    userMessage: string;
    memories: ExtractedUserMemoryCandidate[];
  }) {
    const userMessageComparable = this.toComparable(input.userMessage);

    const uniqueMemories = new Map<
      string,
      {
        userId: string;
        type: UserMemoryType;
        content: string;
        normalizedContent: string;
        confidence: number;
        sourceConversationId: string;
      }
    >();

    for (const rawMemory of input.memories) {
      const memory = {
        ...rawMemory,
        content: this.sanitizeContent(rawMemory.content),
        evidence: this.sanitizeContent(rawMemory.evidence),
      };

      if (!this.isValidMemoryCandidate(memory, userMessageComparable)) {
        continue;
      }

      const normalizedContent = this.normalize(memory.content);

      uniqueMemories.set(`${memory.type}:${normalizedContent}`, {
        userId: input.userId,
        type: memory.type,
        content: memory.content,
        normalizedContent,
        confidence: memory.confidence,
        sourceConversationId: input.conversationId,
      });
    }

    const validMemories = [...uniqueMemories.values()];

    if (validMemories.length === 0) {
      return [];
    }

    const memoriesWithEmbeddings: UserMemoryUpsertInput[] = [];

    for (const memory of validMemories) {
      memoriesWithEmbeddings.push(await this.attachEmbedding(memory));
    }

    return await this.userMemoryRepository.upsertMany(memoriesWithEmbeddings);
  }

  private async attachEmbedding(
    memory: Omit<UserMemoryUpsertInput, 'embedding' | 'embeddingModel'>,
  ): Promise<UserMemoryUpsertInput> {
    if (!this.getBoolean('AI_USER_MEMORY_EMBEDDINGS_ENABLED', true)) {
      return memory;
    }

    try {
      const embedding = await this.embeddingService.generateVector({
        text: this.buildMemoryEmbeddingText(memory),
        taskType: 'RETRIEVAL_DOCUMENT',
        title: 'User memory',
      });

      const expectedDimensions = this.getExpectedEmbeddingDimensions();

      if (embedding.dimensions !== expectedDimensions) {
        this.logger.warn(
          `[UserMemory] skipped embedding because dimensions=${embedding.dimensions}, expected=${expectedDimensions}`,
        );

        return memory;
      }

      return {
        ...memory,
        embedding: embedding.values,
        embeddingModel: `${embedding.model}:${embedding.dimensions}`,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `[UserMemory] embedding failed for type=${memory.type}: ${message}`,
      );

      return memory;
    }
  }

  private buildMemoryEmbeddingText(input: {
    type: UserMemoryType;
    content: string;
  }): string {
    return [
      `Memory type: ${input.type}`,
      `Memory content: ${input.content.trim()}`,
    ].join('\n');
  }

  private isValidMemoryCandidate(
    memory: ExtractedUserMemoryCandidate,
    userMessageComparable: string,
  ): boolean {
    if (!this.allowedTypes.has(memory.type)) {
      this.logger.debug(
        `[UserMemory] rejected invalid type=${String(memory.type)}`,
      );
      return false;
    }

    if (memory.scope !== 'LONG_TERM') {
      return false;
    }

    if (memory.confidence < this.minConfidence) {
      return false;
    }

    if (memory.content.length < this.minContentLength) {
      return false;
    }

    if (memory.evidence.length < this.minEvidenceLength) {
      return false;
    }

    if (!userMessageComparable.includes(this.toComparable(memory.evidence))) {
      this.logger.debug(
        `[UserMemory] rejected memory without user evidence="${memory.content}"`,
      );
      return false;
    }

    return true;
  }

  private sanitizeContent(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private toComparable(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getExpectedEmbeddingDimensions(): number {
    const value = Number(
      this.configService.get<string>('AI_USER_MEMORY_EMBEDDING_DIMENSIONS') ??
        this.configService.get<string>('GEMINI_EMBEDDING_DIMENSIONS') ??
        '384',
    );

    return Number.isFinite(value) && value > 0 ? Math.round(value) : 384;
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string>(key);

    if (value === undefined) {
      return fallback;
    }

    return value.toLowerCase() === 'true';
  }
}
