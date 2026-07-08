import { CallSession } from '../../domain/entities/call-session.entity';

export function buildCallLifecycleMetadata(session: CallSession, now: Date) {
  const ringTimeoutMs =
    session.ringTimeoutMs ??
    Number(process.env.CALL_NO_ANSWER_TIMEOUT_MS || 30000);

  return {
    recipientUserId: session.targetUserId,
    initiatorDisplayName: session.initiatorDisplayName ?? 'Incoming call',
    initiatorAvatarUrl: session.initiatorAvatarUrl,
    ringTimeoutMs,
    expiresAt:
      session.expiresAt?.toISOString() ??
      new Date(now.getTime() + ringTimeoutMs).toISOString(),
  };
}
