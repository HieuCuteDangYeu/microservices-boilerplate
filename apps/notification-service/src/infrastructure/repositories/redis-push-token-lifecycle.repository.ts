import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash, randomUUID } from 'node:crypto';

import {
  IPushTokenLifecycleRepository,
  PushTokenIdentityInput,
  PushTokenLifecycleAction,
  PushTokenLifecycleInput,
} from '../../domain/interfaces/push-token-lifecycle.repository.interface';

const LIFECYCLE_TTL_SECONDS = 15 * 60;
const INVALIDATED_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const LIFECYCLE_LOCK_TTL_MS = 10_000;
const LIFECYCLE_LOCK_WAIT_MS = 3_000;
const LIFECYCLE_LOCK_RETRY_MS = 25;

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class RedisPushTokenLifecycleRepository
  implements IPushTokenLifecycleRepository
{
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async acquireLock(input: PushTokenLifecycleInput): Promise<string | null> {
    if (!input.deviceId || input.lifecycleVersion === undefined) {
      return null;
    }

    const lockId = randomUUID();
    const deadline = Date.now() + LIFECYCLE_LOCK_WAIT_MS;

    while (true) {
      const result = await this.redis.set(
        this.lifecycleLockKey(input),
        lockId,
        'PX',
        LIFECYCLE_LOCK_TTL_MS,
        'NX',
      );

      if (result === 'OK') {
        return lockId;
      }

      if (Date.now() >= deadline) {
        return null;
      }

      await sleep(LIFECYCLE_LOCK_RETRY_MS);
    }
  }

  async releaseLock(
    input: PushTokenLifecycleInput,
    lockId: string,
  ): Promise<void> {
    if (!input.deviceId || input.lifecycleVersion === undefined) {
      return;
    }

    await this.redis.eval(
      `
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        end

        return 0
      `,
      1,
      this.lifecycleLockKey(input),
      lockId,
    );
  }

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

  async markTokenInvalidated(input: PushTokenIdentityInput): Promise<void> {
    await this.redis.set(
      this.invalidatedTokenKey(input),
      '1',
      'EX',
      INVALIDATED_TOKEN_TTL_SECONDS,
    );
  }

  async isTokenInvalidated(input: PushTokenIdentityInput): Promise<boolean> {
    return (await this.redis.exists(this.invalidatedTokenKey(input))) === 1;
  }

  private lifecycleKey(input: PushTokenLifecycleInput) {
    return `notification:push-token-lifecycle:${this.installationHash(input)}`;
  }

  private lifecycleLockKey(input: PushTokenLifecycleInput) {
    return `notification:push-token-lifecycle-lock:${this.installationHash(input)}`;
  }

  private invalidatedTokenKey(input: PushTokenIdentityInput) {
    const identity = `${input.provider}:${input.token}`;
    const tokenHash = createHash('sha256').update(identity).digest('hex');

    return `notification:push-token-invalidated:${tokenHash}`;
  }

  private installationHash(input: PushTokenLifecycleInput) {
    const identity = `${input.provider}:${input.deviceId}`;

    return createHash('sha256').update(identity).digest('hex');
  }
}
