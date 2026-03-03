import { IUserRoleRepository } from '@auth/domain/interfaces/user-role.repository,interface';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisUserRoleRepository implements IUserRoleRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async setUserRoles(userId: string, roles: string[]): Promise<void> {
    await this.redis.set(`roles:${userId}`, JSON.stringify(roles), 'EX', 900);
  }

  async getUserRoles(userId: string): Promise<string[] | null> {
    const data = await this.redis.get(`roles:${userId}`);
    return data ? (JSON.parse(data) as string[]) : null;
  }

  async invalidateUserRoles(userId: string): Promise<void> {
    await this.redis.del(`roles:${userId}`);
  }
}
