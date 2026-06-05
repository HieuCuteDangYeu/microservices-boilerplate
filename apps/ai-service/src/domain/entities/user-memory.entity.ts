import type { UserMemoryType } from '@common/ai/interfaces/user-memory.interface';

export class UserMemory {
  readonly id?: string;
  readonly userId: string;
  readonly type: UserMemoryType;
  readonly content: string;
  readonly normalizedContent: string;
  readonly confidence: number;
  readonly sourceConversationId?: string;
  readonly lastUsedAt?: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(data: {
    id?: string;
    userId: string;
    type: UserMemoryType;
    content: string;
    normalizedContent: string;
    confidence: number;
    sourceConversationId?: string;
    lastUsedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = data.id;
    this.userId = data.userId;
    this.type = data.type;
    this.content = data.content;
    this.normalizedContent = data.normalizedContent;
    this.confidence = data.confidence;
    this.sourceConversationId = data.sourceConversationId;
    this.lastUsedAt = data.lastUsedAt;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
