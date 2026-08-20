import type {
  DeactivatePushTokenInput,
  RegisterPushTokenInput,
} from '../entities/push-token.entity';

export type PushTokenLifecycleInput = Pick<
  RegisterPushTokenInput | DeactivatePushTokenInput,
  'provider' | 'deviceId' | 'lifecycleVersion'
>;

export type PushTokenIdentityInput = Pick<
  RegisterPushTokenInput,
  'provider' | 'token'
>;

export type PushTokenLifecycleAction = 'register' | 'deactivate';

export abstract class IPushTokenLifecycleRepository {
  abstract acquireLock(input: PushTokenLifecycleInput): Promise<string | null>;

  abstract releaseLock(
    input: PushTokenLifecycleInput,
    lockId: string,
  ): Promise<void>;

  abstract advance(
    input: PushTokenLifecycleInput,
    action: PushTokenLifecycleAction,
  ): Promise<boolean>;

  abstract isCurrent(
    input: PushTokenLifecycleInput,
    action: PushTokenLifecycleAction,
  ): Promise<boolean>;

  abstract markTokenInvalidated(input: PushTokenIdentityInput): Promise<void>;

  abstract isTokenInvalidated(input: PushTokenIdentityInput): Promise<boolean>;
}
