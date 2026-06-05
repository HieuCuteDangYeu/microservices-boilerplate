export class ConversationMemory {
  readonly id?: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly summary: string;
  readonly messageCount: number;
  readonly lastMessageAt?: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;

  constructor(data: {
    id?: string;
    conversationId: string;
    userId: string;
    summary: string;
    messageCount: number;
    lastMessageAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = data.id;
    this.conversationId = data.conversationId;
    this.userId = data.userId;
    this.summary = data.summary;
    this.messageCount = data.messageCount;
    this.lastMessageAt = data.lastMessageAt;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
