export type CallParticipantRole = 'host' | 'guest';

export class CallParticipant {
  userId: string;
  roomId: string;
  role: CallParticipantRole;
  socketId?: string;
  isConnected: boolean;
  joinedAt: Date;

  constructor(partial: Partial<CallParticipant>) {
    Object.assign(this, partial);
    this.isConnected = partial.isConnected ?? false;
    this.joinedAt = partial.joinedAt ?? new Date();
  }
}
