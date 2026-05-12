export type CallTransportDirection = 'send' | 'recv';

export class CallTransport {
  id: string;
  userId: string;
  roomId: string;
  direction: CallTransportDirection;
  iceParameters?: Record<string, unknown>;
  iceCandidates?: unknown[];
  dtlsParameters?: Record<string, unknown>;
  createdAt: Date;

  constructor(partial: Partial<CallTransport>) {
    Object.assign(this, partial);
    this.createdAt = partial.createdAt ?? new Date();
  }
}
