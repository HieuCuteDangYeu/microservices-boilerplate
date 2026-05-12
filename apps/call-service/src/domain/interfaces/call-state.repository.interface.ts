import { CallParticipant } from '../entities/call-participant.entity';
import { CallTransport } from '../entities/call-transport.entity';

export abstract class ICallStateRepository {
  abstract upsertParticipant(participant: CallParticipant): Promise<void>;
  abstract removeParticipant(roomId: string, userId: string): Promise<void>;
  abstract getParticipants(roomId: string): Promise<CallParticipant[]>;
  abstract saveTransport(transport: CallTransport): Promise<void>;
  abstract getTransport(
    roomId: string,
    userId: string,
    direction: string,
  ): Promise<CallTransport | null>;
}
