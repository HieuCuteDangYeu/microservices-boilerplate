export class CallRoom {
  id!: string;
  hostId!: string;
  participantIds!: string[];
  routerId?: string;
  workerId?: string;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(partial: Partial<CallRoom>) {
    Object.assign(this, partial);
  }
}
