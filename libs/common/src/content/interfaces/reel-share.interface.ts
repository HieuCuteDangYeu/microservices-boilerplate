export interface ReelShareMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  media?: unknown;
  createdAt: string;
  createdAtMs?: number;
}

export interface ReelShareResponse {
  id: string;
  reelId: string;
  ownerId: string;
  sharedByUserId: string;
  sharedWithUserId?: string | null;
  conversationId: string;
  messageId?: string | null;
  createdAt: string;
  message?: ReelShareMessagePayload;
}
