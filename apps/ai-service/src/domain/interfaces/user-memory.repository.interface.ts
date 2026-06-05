import type { UserMemoryType } from '@common/ai/interfaces/user-memory.interface';
import { UserMemory } from '../entities/user-memory.entity';

export interface UserMemoryUpsertInput {
  userId: string;
  type: UserMemoryType;
  content: string;
  normalizedContent: string;
  confidence: number;
  sourceConversationId?: string;
}

export interface IUserMemoryRepository {
  findByUserId(userId: string, limit: number): Promise<UserMemory[]>;
  upsertMany(memories: UserMemoryUpsertInput[]): Promise<UserMemory[]>;
  markUsed(memoryIds: string[]): Promise<void>;
}
