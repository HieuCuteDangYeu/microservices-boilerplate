import type { ExtractedUserMemoryCandidate } from '@common/ai/interfaces/extract-user-memory.interface';
import type { UserMemoryType } from '@common/ai/interfaces/user-memory.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IUserMemoryRepository } from '../../domain/interfaces/user-memory.repository.interface';

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
    @Inject('IUserMemoryRepository')
    private readonly userMemoryRepository: IUserMemoryRepository,
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

      uniqueMemories.set(normalizedContent, {
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

    return await this.userMemoryRepository.upsertMany(validMemories);
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
}
