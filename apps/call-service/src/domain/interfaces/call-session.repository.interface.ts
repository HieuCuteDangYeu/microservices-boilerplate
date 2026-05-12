import { CallSession } from '../entities/call-session.entity';

export abstract class ICallSessionRepository {
  abstract save(session: CallSession): Promise<CallSession>;
  abstract findByRoomId(roomId: string): Promise<CallSession | null>;
  abstract updateStatus(
    roomId: string,
    status: CallSession['status'],
  ): Promise<CallSession | null>;
}
