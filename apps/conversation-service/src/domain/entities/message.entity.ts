import { ReadStatus } from 'apps/conversation-service/src/domain/entities/read-status.entity';

export interface MessageReaction {
  emoji: string;
  createdAt: string;
}

export type MessageReactionMap = Record<string, MessageReaction>;

export interface MessageReplyPreview {
  senderName: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'file' | 'call';
}

export interface RecallMessageResult {
  message: Message;
  updatedReplyMessageIds: string[];
  previewContent: string;
}

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
  isRecalled?: boolean;
  recalledAt?: Date;
  replyToId?: string;
  replyPreview?: MessageReplyPreview;
  reactions?: MessageReactionMap;

  constructor(partial: Partial<Message>) {
    Object.assign(this, partial);

    this.readBy = (partial.readBy || []).map((status) =>
      status instanceof ReadStatus ? status : new ReadStatus(status),
    );
  }
}
