import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { CallSession } from '../../domain/entities/call-session.entity';
import { ICallSessionRepository } from '../../domain/interfaces/call-session.repository.interface';

@Injectable()
export class RedisCallSessionRepository implements ICallSessionRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async save(session: CallSession): Promise<CallSession> {
    await this.redis.set(
      this.key(session.callId),
      JSON.stringify(session),
      'EX',
      60 * 60 * 6,
    );
    return session;
  }

  async findByCallId(callId: string): Promise<CallSession | null> {
    const raw = await this.redis.get(this.key(callId));
    if (!raw) return null;
    return new CallSession(JSON.parse(raw) as Partial<CallSession>);
  }

  async delete(callId: string): Promise<void> {
    await this.redis.del(this.key(callId));
  }

  private key(callId: string): string {
    return `call:${callId}:session`;
  }
}
