import type { AiRecommendedReel } from '@common/ai/dtos/ask-question-response.dto';
import { ReadStatus } from './read-status.entity';

export interface MessageReaction {
  emoji: string;
  createdAt: string;
}

export type MessageReactionMap = Record<string, MessageReaction>;

export type ConversationMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'file'
  | 'call'
  | 'reel';

export interface MessageReplyPreview {
  senderName: string;
  content: string;
  thumbnailUri?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  type: ConversationMessageType;
}

export interface MessageMedia {
  fileKey?: string;
  fileUrl: string;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  status?: 'ready' | 'processing' | 'failed';
  failureReason?: string;
  reelId?: string;
  reelOwnerId?: string;
  reelOwnerUsername?: string;
  reelOwnerAvatarUrl?: string;
  reelTitle?: string;
  reelDescription?: string;
  reelTags?: string[];
}

export interface MessageMetadata {
  kind?: 'velora_ai_reel_recommendations';
  recommendedReels?: AiRecommendedReel[];
  suggestedQueries?: string[];
}

export interface RecallMessageResult {
  message: Message;
  updatedReplyMessageIds: string[];
  previewContent: string;
}

export class Message {
  id!: string;
  conversationId!: string;
  senderId!: string;
  clientMessageId?: string;
  signalType!: number;
  content!: string;
  media?: MessageMedia;
  metadata?: MessageMetadata;
  registrationId?: number;
  type!: string;
  createdAt!: Date;
  readBy: ReadStatus[] = [];
  isRecalled?: boolean;
  recalledAt?: Date;
  replyToId?: string;
  replyPreview?: MessageReplyPreview;
  reactions?: MessageReactionMap;

  constructor(partial: Partial<Message> = {}) {
    Object.assign(this, partial);

    this.readBy = (partial.readBy || []).map((status) =>
      status instanceof ReadStatus ? status : new ReadStatus(status),
    );
  }
}
