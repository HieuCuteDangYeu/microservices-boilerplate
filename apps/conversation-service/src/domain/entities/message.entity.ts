import { ReadStatus } from 'apps/conversation-service/src/domain/entities/read-status.entity';

export class Message {
  id: string;
  conversationId: string;
  senderId: string;
  signalType: number;
  content: string;
  registrationId?: number;
  type: string;
  createdAt: Date;
  readBy: ReadStatus[];

  constructor(partial: Partial<Message>) {
    Object.assign(this, partial);

    this.readBy = (partial.readBy || []).map((status) =>
      status instanceof ReadStatus ? status : new ReadStatus(status),
    );
  }
}
