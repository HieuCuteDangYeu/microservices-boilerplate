import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { CallParticipant } from '../../domain/entities/call-participant.entity';
import { ICallStateRepository } from '../../domain/interfaces/call-state.repository.interface';

export interface StoredRoomState {
  callId: string;
  routerId: string;
  workerId: string;
}

export interface StoredTransportState {
  transportId: string;
  callId: string;
  userId: string;
  direction: 'send' | 'recv';
  connected: boolean;
}

export interface StoredProducerState {
  producerId: string;
  transportId: string;
  callId: string;
  userId: string;
  kind: 'audio' | 'video';
}

@Injectable()
export class RedisCallStateRepository implements ICallStateRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async upsertParticipant(participant: CallParticipant): Promise<void> {
    const existing = await this.getParticipant(
      participant.callId,
      participant.userId,
    );
    const nextParticipant = new CallParticipant({
      ...existing,
      ...participant,
      socketIds: participant.socketIds,
      isConnected:
        participant.isConnected ??
        existing?.isConnected ??
        participant.socketIds.length > 0,
    });
    const key = this.participantKey(participant.callId);
    await this.redis.hset(
      key,
      participant.userId,
      JSON.stringify(nextParticipant),
    );
    await this.redis.expire(key, 60 * 60 * 6);
  }

  async removeParticipant(callId: string, userId: string): Promise<void> {
    await this.redis.hdel(this.participantKey(callId), userId);
  }

  async removeParticipantSocket(
    callId: string,
    userId: string,
    socketId: string,
  ): Promise<CallParticipant | null> {
    const participant = await this.getParticipant(callId, userId);
    if (!participant) {
      return null;
    }

    const remainingSocketIds = participant.socketIds.filter(
      (storedSocketId) => storedSocketId !== socketId,
    );
    const nextParticipant = new CallParticipant({
      ...participant,
      socketId: remainingSocketIds[0],
      socketIds: remainingSocketIds,
      isConnected: remainingSocketIds.length > 0,
    });

    if (remainingSocketIds.length === 0) {
      await this.redis.hdel(this.participantKey(callId), userId);
      return nextParticipant;
    }

    const key = this.participantKey(callId);
    await this.redis.hset(key, userId, JSON.stringify(nextParticipant));
    await this.redis.expire(key, 60 * 60 * 6);
    return nextParticipant;
  }

  async getParticipants(callId: string): Promise<CallParticipant[]> {
    const entries = await this.redis.hgetall(this.participantKey(callId));
    return Object.values(entries).map(
      (value) =>
        new CallParticipant(JSON.parse(value) as Partial<CallParticipant>),
    );
  }

  async getParticipant(
    callId: string,
    userId: string,
  ): Promise<CallParticipant | null> {
    const raw = await this.redis.hget(this.participantKey(callId), userId);
    if (!raw) {
      return null;
    }

    return new CallParticipant(JSON.parse(raw) as Partial<CallParticipant>);
  }

  async clearCallState(callId: string): Promise<void> {
    const transportKeys = await this.redis.smembers(
      this.transportIndexKey(callId),
    );
    const producerKeys = await this.redis.smembers(
      this.producerIndexKey(callId),
    );
    const keys = [
      this.roomKey(callId),
      this.participantKey(callId),
      this.transportIndexKey(callId),
      this.producerIndexKey(callId),
      ...transportKeys,
      ...producerKeys,
    ];

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async getTransport(
    callId: string,
    userId: string,
    direction: string,
  ): Promise<StoredTransportState | null> {
    const raw = await this.redis.get(
      this.transportKey(callId, userId, direction),
    );
    if (!raw) return null;
    return JSON.parse(raw) as StoredTransportState;
  }

  async saveRoom(room: StoredRoomState): Promise<void> {
    await this.redis.set(
      this.roomKey(room.callId),
      JSON.stringify(room),
      'EX',
      60 * 60 * 6,
    );
  }

  async getRoom(callId: string): Promise<StoredRoomState | null> {
    const raw = await this.redis.get(this.roomKey(callId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredRoomState;
  }

  async saveTransportState(state: StoredTransportState): Promise<void> {
    const key = this.transportKey(state.callId, state.userId, state.direction);
    await this.redis.set(key, JSON.stringify(state), 'EX', 60 * 60 * 6);
    await this.redis.sadd(this.transportIndexKey(state.callId), key);
    await this.redis.expire(this.transportIndexKey(state.callId), 60 * 60 * 6);
  }

  async saveProducerState(state: StoredProducerState): Promise<void> {
    const key = this.producerKey(state.callId, state.userId, state.producerId);
    await this.redis.set(key, JSON.stringify(state), 'EX', 60 * 60 * 6);
    await this.redis.sadd(this.producerIndexKey(state.callId), key);
    await this.redis.expire(this.producerIndexKey(state.callId), 60 * 60 * 6);
  }

  private roomKey(callId: string): string {
    return `call:${callId}:room`;
  }

  private participantKey(callId: string): string {
    return `call:${callId}:participants`;
  }

  private transportKey(
    callId: string,
    userId: string,
    direction: string,
  ): string {
    return `call:${callId}:transport:${userId}:${direction}`;
  }

  private producerKey(
    callId: string,
    userId: string,
    producerId: string,
  ): string {
    return `call:${callId}:producer:${userId}:${producerId}`;
  }

  private transportIndexKey(callId: string): string {
    return `call:${callId}:transport-index`;
  }

  private producerIndexKey(callId: string): string {
    return `call:${callId}:producer-index`;
  }
}
