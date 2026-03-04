import { Message } from './message.entity';

export interface ChatParticipant {
  id: string;
  name?: string;
  avatar?: string;
  email?: string;
}
export class Conversation {
  id: string;
  creatorId: string;
  participantIds: string[];
  participants?: ChatParticipant[];
  lastMessage?: string | null;
  lastMessageAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: Message[]; // Optional relation
  isGroup: boolean;

  constructor(partial?: Partial<Conversation>) {
    Object.assign(this, partial);
  }
}
