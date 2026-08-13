export const CONTENT_OUTBOX_WAKE_EVENT = 'content.outbox.wake';

export interface IOutboxDispatchTrigger {
  trigger(): void;
}
