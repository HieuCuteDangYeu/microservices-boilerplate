import { Message } from './message.entity';

export interface ChatParticipant {
  id: string;
  name?: string;
  fullName?: string;
  avatar?: string;
  email?: string;
}

export class Conversation {
  id!: string;
  creatorId!: string;
  participantIds: string[] = [];
  participants?: ChatParticipant[];
  name?: string | null;
  picture?: string | null;
  memberJoinedAt?: Record<string, string>;
  lastMessage?: string | null;
  lastMessageAt?: Date | null;
  unreadCount?: number;
  createdAt!: Date;
  updatedAt!: Date;
  messages?: Message[];
  isGroup!: boolean;

  constructor(partial: Partial<Conversation> = {}) {
    Object.assign(this, partial);
  }
}
