import { CallSession } from '../entities/call-session.entity';

export abstract class ICallSessionRepository {
  abstract save(session: CallSession): Promise<CallSession>;
  abstract findByCallId(callId: string): Promise<CallSession | null>;
  abstract delete(callId: string): Promise<void>;
}
