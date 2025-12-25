import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { IVerificationCodeRepository } from '../../domain/interfaces/verification-code.repository.interface';

@Injectable()
export class RedisVerificationCodeRepository implements IVerificationCodeRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async save(code: string, userId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`verify:${code}`, userId, 'EX', ttlSeconds);
  }

  async getUserId(code: string): Promise<string | null> {
    return this.redis.get(`verify:${code}`);
  }

  async delete(code: string): Promise<void> {
    await this.redis.del(`verify:${code}`);
  }
}
