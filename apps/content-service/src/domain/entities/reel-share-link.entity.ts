export class ReelShareLink {
  id!: string;
  reelId!: string;
  ownerId!: string;
  token!: string;
  createdBy!: string;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  clickCount!: bigint;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<ReelShareLink> = {}) {
    Object.assign(this, partial);
  }
}
