import type {
  DeactivatePushTokenInput,
  RegisterPushTokenInput,
} from '../entities/push-token.entity';

export type PushTokenLifecycleInput = Pick<
  RegisterPushTokenInput | DeactivatePushTokenInput,
  'provider' | 'deviceId' | 'lifecycleVersion'
>;

export type PushTokenLifecycleAction = 'register' | 'deactivate';

export abstract class IPushTokenLifecycleRepository {
  abstract advance(
    input: PushTokenLifecycleInput,
    action: PushTokenLifecycleAction,
  ): Promise<boolean>;

  abstract isCurrent(
    input: PushTokenLifecycleInput,
    action: PushTokenLifecycleAction,
  ): Promise<boolean>;
}
