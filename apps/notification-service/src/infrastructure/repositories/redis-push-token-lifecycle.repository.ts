import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';

import {
  IPushTokenLifecycleRepository,
  PushTokenLifecycleAction,
  PushTokenLifecycleInput,
} from '../../domain/interfaces/push-token-lifecycle.repository.interface';

const LIFECYCLE_TTL_SECONDS = 15 * 60;

@Injectable()
export class RedisPushTokenLifecycleRepository implements IPushTokenLifecycleRepository {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async advance(
    input: PushTokenLifecycleInput,
    action: PushTokenLifecycleAction,
  ): Promise<boolean> {
    if (!input.deviceId || input.lifecycleVersion === undefined) {
      return true;
    }

    const result = await this.redis.eval(
      `
        local current = redis.call('GET', KEYS[1])
        local candidateVersion = tonumber(ARGV[1])
        local candidateAction = ARGV[2]

        if not current then
          redis.call('SET', KEYS[1], ARGV[1] .. ':' .. candidateAction, 'EX', ARGV[3])
          return 1
        end

        local separator = string.find(current, ':')
        local currentVersion = tonumber(string.sub(current, 1, separator - 1))
        local currentAction = string.sub(current, separator + 1)

        if candidateVersion > currentVersion then
          redis.call('SET', KEYS[1], ARGV[1] .. ':' .. candidateAction, 'EX', ARGV[3])
          return 1
        end

        if candidateVersion == currentVersion and candidateAction == currentAction then
          redis.call('EXPIRE', KEYS[1], ARGV[3])
          return 1
        end

        return 0
      `,
      1,
      this.lifecycleKey(input),
      String(input.lifecycleVersion),
      action,
      String(LIFECYCLE_TTL_SECONDS),
    );

    return result === 1;
  }

  async isCurrent(
    input: PushTokenLifecycleInput,
    action: PushTokenLifecycleAction,
  ): Promise<boolean> {
    if (!input.deviceId || input.lifecycleVersion === undefined) {
      return true;
    }

    return (
      (await this.redis.get(this.lifecycleKey(input))) ===
      `${input.lifecycleVersion}:${action}`
    );
  }

  private lifecycleKey(input: PushTokenLifecycleInput) {
    const identity = `${input.provider}:${input.deviceId}`;
    const installationHash = createHash('sha256')
      .update(identity)
      .digest('hex');

    return `notification:push-token-lifecycle:${installationHash}`;
  }
}
