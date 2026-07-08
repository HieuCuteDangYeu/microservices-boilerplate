export type CallSessionStatus =
  | 'initiated'
  | 'ringing'
  | 'active'
  | 'cancelled'
  | 'ended'
  | 'rejected';

export type CallType = 'VOICE' | 'VIDEO';

export class CallSession {
  callId!: string;
  conversationId!: string;
  initiatorId!: string;
  targetUserId!: string;
  initiatorDisplayName?: string;
  initiatorAvatarUrl?: string;
  ringTimeoutMs?: number;
  expiresAt?: Date;
  callType!: CallType;
  status!: CallSessionStatus;
  participantIds!: string[];
  answeredAt?: Date;
  endedAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<CallSession>) {
    Object.assign(this, partial);
    this.createdAt = this.toDate(partial.createdAt) ?? new Date();
    this.updatedAt = this.toDate(partial.updatedAt) ?? new Date();
    this.answeredAt = this.toDate(partial.answeredAt);
    this.endedAt = this.toDate(partial.endedAt);
    this.expiresAt = this.toDate(partial.expiresAt);
    this.participantIds = partial.participantIds ?? [];
  }

  private toDate(value?: Date | string): Date | undefined {
    if (!value) return undefined;
    return value instanceof Date ? value : new Date(value);
  }
}
