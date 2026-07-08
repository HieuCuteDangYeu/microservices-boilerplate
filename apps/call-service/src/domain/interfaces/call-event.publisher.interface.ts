import type { CallType } from '../entities/call-session.entity';

export type CallLifecycleEvent =
  | 'call.initiated'
  | 'call.answered'
  | 'call.ended'
  | 'call.rejected';

export interface CallLifecyclePayload {
  callId: string;
  conversationId: string;
  initiatorId: string;
  targetUserId: string;
  recipientUserId: string;
  userId: string;
  callType: CallType;
  initiatorDisplayName: string;
  initiatorAvatarUrl?: string;
  ringTimeoutMs: number;
  expiresAt: string;
  reason?: string;
  at: string;
}

export abstract class ICallEventPublisher {
  abstract publish(
    event: CallLifecycleEvent,
    payload: CallLifecyclePayload,
  ): Promise<void>;
}
