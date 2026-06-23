import { UserMemory } from '@ai/domain/entities/user-memory.entity';
import type { IUserMemoryRepository } from '@ai/domain/interfaces/user-memory.repository.interface';
import type { RelevantUserMemoriesContext } from '@common/ai/interfaces/user-memory.interface';
import { Inject, Injectable } from '@nestjs/common';

interface ScoredUserMemory {
  memory: UserMemory;
  score: number;
  relevanceScore: number;
}

@Injectable()
export class GetRelevantUserMemoriesUseCase {
  private readonly defaultLimit = 8;
  private readonly maxSelectedMemories = 12;
  private readonly candidateMultiplier = 5;
  private readonly maxCandidatePool = 60;

  private readonly minRelevanceScore = 0.12;
  private readonly fallbackLimit = 3;

  constructor(
    @Inject('IUserMemoryRepository')
    private readonly userMemoryRepository: IUserMemoryRepository,
  ) {}

  async execute(input: {
    userId: string;
    queryText: string;
    limit?: number;
  }): Promise<RelevantUserMemoriesContext> {
    const selectedLimit = this.normalizeLimit(
      input.limit ?? this.defaultLimit,
      1,
      this.maxSelectedMemories,
    );

    const candidateLimit = Math.min(
      this.maxCandidatePool,
      Math.max(selectedLimit * this.candidateMultiplier, selectedLimit),
    );

    const candidates = await this.userMemoryRepository.findByUserId(
      input.userId,
      candidateLimit,
    );

    const selected = this.selectRelevantMemories({
      candidates,
      queryText: input.queryText,
      limit: selectedLimit,
    });

    await this.userMemoryRepository.markUsed(
      selected
        .map((memory) => memory.id)
        .filter((id): id is string => Boolean(id)),
    );

    return {
      memories: selected.map((memory) => ({
        id: memory.id,
        userId: memory.userId,
        type: memory.type,
        content: memory.content,
        confidence: memory.confidence,
        sourceConversationId: memory.sourceConversationId,
        createdAt: memory.createdAt?.toISOString(),
        updatedAt: memory.updatedAt?.toISOString(),
      })),
    };
  }

  private selectRelevantMemories(input: {
    candidates: UserMemory[];
    queryText: string;
    limit: number;
  }): UserMemory[] {
    if (input.candidates.length === 0) {
      return [];
    }

    const scored = this.scoreMemories(input.candidates, input.queryText);

    const relevant = scored.filter(
      (item) => item.relevanceScore >= this.minRelevanceScore,
    );

    if (relevant.length > 0) {
      return relevant.slice(0, input.limit).map((item) => item.memory);
    }

    return scored
      .filter((item) => item.memory.confidence >= 0.75)
      .slice(0, Math.min(input.limit, this.fallbackLimit))
      .map((item) => item.memory);
  }

  private scoreMemories(
    memories: UserMemory[],
    queryText: string,
  ): ScoredUserMemory[] {
    const queryTokens = this.tokenize(queryText);
    const documentTokens = memories.map((memory) =>
      this.tokenize(`${memory.type} ${memory.content}`),
    );

    const documentFrequency = this.buildDocumentFrequency(documentTokens);

    return memories
      .map((memory, index) => {
        const memoryTokens = documentTokens[index];

        const relevanceScore = this.calculateWeightedOverlap({
          queryTokens,
          memoryTokens,
          documentFrequency,
          documentCount: memories.length,
        });

        const exactTextScore = this.calculateExactTextScore(
          queryText,
          memory.content,
        );

        const confidenceScore = this.clamp(memory.confidence, 0, 1);
        const recencyScore = this.calculateRecencyScore(memory.updatedAt);
        const antiRepeatScore = this.calculateAntiRepeatScore(
          memory.lastUsedAt,
        );

        const score =
          relevanceScore * 0.58 +
          exactTextScore * 0.12 +
          confidenceScore * 0.18 +
          recencyScore * 0.08 +
          antiRepeatScore * 0.04;

        return {
          memory,
          score,
          relevanceScore,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return (
          (b.memory.updatedAt?.getTime() ?? 0) -
          (a.memory.updatedAt?.getTime() ?? 0)
        );
      });
  }

  private calculateWeightedOverlap(input: {
    queryTokens: Set<string>;
    memoryTokens: Set<string>;
    documentFrequency: Map<string, number>;
    documentCount: number;
  }): number {
    if (input.queryTokens.size === 0 || input.memoryTokens.size === 0) {
      return 0;
    }

    let matchedWeight = 0;
    let totalWeight = 0;

    for (const token of input.queryTokens) {
      const frequency = input.documentFrequency.get(token) ?? 0;
      const inverseDocumentFrequency = Math.log(
        1 + (input.documentCount + 1) / (frequency + 1),
      );

      totalWeight += inverseDocumentFrequency;

      if (input.memoryTokens.has(token)) {
        matchedWeight += inverseDocumentFrequency;
      }
    }

    if (totalWeight === 0) {
      return 0;
    }

    return matchedWeight / totalWeight;
  }

  private calculateExactTextScore(
    queryText: string,
    memoryContent: string,
  ): number {
    const query = this.normalize(queryText);
    const memory = this.normalize(memoryContent);

    if (!query || !memory) {
      return 0;
    }

    if (memory.includes(query)) {
      return 1;
    }

    if (query.includes(memory) && memory.length >= 20) {
      return 0.8;
    }

    return 0;
  }

  private buildDocumentFrequency(
    documents: Set<string>[],
  ): Map<string, number> {
    const frequency = new Map<string, number>();

    for (const tokens of documents) {
      for (const token of tokens) {
        frequency.set(token, (frequency.get(token) ?? 0) + 1);
      }
    }

    return frequency;
  }

  private calculateRecencyScore(updatedAt?: Date): number {
    if (!updatedAt) {
      return 0.2;
    }

    const ageMs = Date.now() - updatedAt.getTime();
    const ageDays = Math.max(ageMs / 86_400_000, 0);

    if (ageDays <= 1) {
      return 1;
    }

    if (ageDays >= 90) {
      return 0.15;
    }

    return 1 - ageDays / 100;
  }

  private calculateAntiRepeatScore(lastUsedAt?: Date): number {
    if (!lastUsedAt) {
      return 1;
    }

    const ageMs = Date.now() - lastUsedAt.getTime();
    const ageHours = Math.max(ageMs / 3_600_000, 0);

    if (ageHours <= 1) {
      return 0.1;
    }

    if (ageHours <= 24) {
      return 0.6;
    }

    return 1;
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      this.normalize(value)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= 3),
    );
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeLimit(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }

    return Math.min(Math.max(Math.floor(value), min), max);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
