export type CallSessionStatus =
  | 'idle'
  | 'ringing'
  | 'active'
  | 'ended'
  | 'rejected';

export class CallSession {
  id: string;
  roomId: string;
  initiatorId: string;
  status: CallSessionStatus;
  participantIds: string[];
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<CallSession>) {
    Object.assign(this, partial);
  }
}
