import { UserMemory } from '@ai/domain/entities/user-memory.entity';
import type { UserMemoryType } from '@common/ai/interfaces/user-memory.interface';

export interface UserMemoryUpsertInput {
  userId: string;
  type: UserMemoryType;
  content: string;
  normalizedContent: string;
  confidence: number;
  sourceConversationId?: string;
  embedding?: number[];
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingVersion?: string;
}

export interface UserMemorySemanticSearchInput {
  userId: string;
  queryVector: number[];
  queryEmbeddingModel?: string;
  queryEmbeddingVersion?: string;
  limit: number;
  minScore?: number;
  minConfidence?: number;
}

export interface UserMemoryEmbeddingIdentity {
  model: string;
  dimensions: number;
  version: string;
}

export interface UserMemoryEmbeddingUpdateInput {
  memoryId: string;
  embedding: number[];
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingVersion: string;
}

export interface IUserMemoryRepository {
  getEmbeddingDimensions(): Promise<number>;
  findByUserId(userId: string, limit: number): Promise<UserMemory[]>;
  findRelevantByUserId(
    input: UserMemorySemanticSearchInput,
  ): Promise<UserMemory[]>;
  findWithoutEmbedding(
    limit: number,
    identity?: UserMemoryEmbeddingIdentity,
  ): Promise<UserMemory[]>;
  upsertMany(memories: UserMemoryUpsertInput[]): Promise<UserMemory[]>;
  replaceSimilar(
    memoryId: string,
    memory: UserMemoryUpsertInput,
  ): Promise<UserMemory>;
  updateEmbedding(input: UserMemoryEmbeddingUpdateInput): Promise<void>;
  markUsed(memoryIds: string[]): Promise<void>;
}
