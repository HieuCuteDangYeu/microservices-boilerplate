export type CallLifecycleEvent =
  | 'call.initiated'
  | 'call.answered'
  | 'call.ended'
  | 'call.rejected';

export interface CallLifecyclePayload {
  roomId: string;
  userId: string;
  targetUserId?: string;
  reason?: string;
  at: string;
}

export abstract class ICallEventPublisher {
  abstract publish(
    event: CallLifecycleEvent,
    payload: CallLifecyclePayload,
  ): Promise<void>;
}
