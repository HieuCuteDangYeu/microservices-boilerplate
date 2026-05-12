import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { CallParticipant } from '../../domain/entities/call-participant.entity';
import { CallTransport } from '../../domain/entities/call-transport.entity';
import { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

export interface StoredRoomState {
  roomId: string;
  routerId: string;
  workerId: string;
}

export interface StoredTransportState {
  transportId: string;
  roomId: string;
  userId: string;
  direction: 'send' | 'recv';
  connected: boolean;
}

export interface StoredProducerState {
  producerId: string;
  transportId: string;
  roomId: string;
  userId: string;
  kind: 'audio' | 'video';
}

@Injectable()
export class RedisCallStateRepository implements ICallStateRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async upsertParticipant(participant: CallParticipant): Promise<void> {
    const key = this.participantKey(participant.roomId);
    await this.redis.hset(key, participant.userId, JSON.stringify(participant));
    await this.redis.expire(key, 60 * 60 * 6);
  }

  async removeParticipant(roomId: string, userId: string): Promise<void> {
    await this.redis.hdel(this.participantKey(roomId), userId);
  }

  async getParticipants(roomId: string): Promise<CallParticipant[]> {
    const entries = await this.redis.hgetall(this.participantKey(roomId));
    return Object.values(entries).map(
      (value) =>
        new CallParticipant(JSON.parse(value) as Partial<CallParticipant>),
    );
  }

  async saveTransport(transport: CallTransport): Promise<void> {
    await this.saveTransportState({
      transportId: transport.id,
      roomId: transport.roomId,
      userId: transport.userId,
      direction: transport.direction,
      connected: false,
    });
  }

  async getTransport(
    roomId: string,
    userId: string,
    direction: string,
  ): Promise<CallTransport | null> {
    const raw = await this.redis.get(
      this.transportKey(roomId, userId, direction),
    );
    if (!raw) return null;
    return new CallTransport(JSON.parse(raw) as Partial<CallTransport>);
  }

  async saveRoom(room: StoredRoomState): Promise<void> {
    await this.redis.set(
      this.roomKey(room.roomId),
      JSON.stringify(room),
      'EX',
      60 * 60 * 6,
    );
  }

  async getRoom(roomId: string): Promise<StoredRoomState | null> {
    const raw = await this.redis.get(this.roomKey(roomId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredRoomState;
  }

  async removeRoom(roomId: string): Promise<void> {
    await this.redis.del(this.roomKey(roomId));
    await this.redis.del(this.participantKey(roomId));
  }

  async saveTransportState(state: StoredTransportState): Promise<void> {
    await this.redis.set(
      this.transportKey(state.roomId, state.userId, state.direction),
      JSON.stringify(state),
      'EX',
      60 * 60 * 6,
    );
  }

  async saveProducerState(state: StoredProducerState): Promise<void> {
    await this.redis.set(
      this.producerKey(state.roomId, state.userId, state.producerId),
      JSON.stringify(state),
      'EX',
      60 * 60 * 6,
    );
  }

  private roomKey(roomId: string): string {
    return `call:${roomId}:room`;
  }

  private participantKey(roomId: string): string {
    return `call:${roomId}:participants`;
  }

  private transportKey(
    roomId: string,
    userId: string,
    direction: string,
  ): string {
    return `call:${roomId}:transport:${userId}:${direction}`;
  }

  private producerKey(
    roomId: string,
    userId: string,
    producerId: string,
  ): string {
    return `call:${roomId}:producer:${userId}:${producerId}`;
  }
}
