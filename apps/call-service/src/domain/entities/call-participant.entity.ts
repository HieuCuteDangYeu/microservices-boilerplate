export type CallParticipantRole = 'host' | 'guest';

export class CallParticipant {
  userId!: string;
  callId!: string;
  role!: CallParticipantRole;
  socketId?: string;
  socketIds!: string[];
  isConnected!: boolean;
  joinedAt!: Date;

  constructor(partial: Partial<CallParticipant>) {
    Object.assign(this, partial);
    this.socketIds = this.normalizeSocketIds(partial);
    this.socketId = partial.socketId ?? this.socketIds[0];
    this.isConnected = partial.isConnected ?? false;
    this.joinedAt =
      partial.joinedAt instanceof Date
        ? partial.joinedAt
        : partial.joinedAt
          ? new Date(partial.joinedAt)
          : new Date();
  }

  private normalizeSocketIds(partial: Partial<CallParticipant>): string[] {
    const rawSocketIds = Array.isArray(partial.socketIds)
      ? partial.socketIds
      : partial.socketId
        ? [partial.socketId]
        : [];

    return [
      ...new Set(
        rawSocketIds.filter((socketId): socketId is string => !!socketId),
      ),
    ];
  }
}
