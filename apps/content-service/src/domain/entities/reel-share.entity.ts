export class ReelShare {
  id!: string;
  reelId!: string;
  ownerId!: string;
  sharedByUserId!: string;
  sharedWithUserId?: string | null;
  conversationId!: string;
  messageId?: string | null;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<ReelShare> = {}) {
    Object.assign(this, partial);
  }
}
