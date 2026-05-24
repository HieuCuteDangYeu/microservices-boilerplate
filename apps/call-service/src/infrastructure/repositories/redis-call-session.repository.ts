import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { CallSession } from '../../domain/entities/call-session.entity';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';

@Injectable()
export class RedisCallSessionRepository implements ICallSessionRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async save(session: CallSession): Promise<CallSession> {
    await this.redis.set(
      this.key(session.roomId),
      JSON.stringify(session),
      'EX',
      60 * 60 * 6,
    );
    return session;
  }

  async findByRoomId(roomId: string): Promise<CallSession | null> {
    const raw = await this.redis.get(this.key(roomId));
    if (!raw) return null;
    return new CallSession(JSON.parse(raw) as Partial<CallSession>);
  }

  async updateStatus(
    roomId: string,
    status: CallSession['status'],
  ): Promise<CallSession | null> {
    const session = await this.findByRoomId(roomId);
    if (!session) return null;

    session.status = status;
    session.updatedAt = new Date();
    await this.save(session);
    return session;
  }

  private key(roomId: string): string {
    return `call:${roomId}:session`;
  }
}
