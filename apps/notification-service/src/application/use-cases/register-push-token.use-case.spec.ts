import { PushToken } from '../../domain/entities/push-token.entity';
import {
  FcmPushTokenInvalidatedError,
  PushTokenLifecycleConflictError,
} from '../../domain/errors/notification.errors';
import type { IPushTokenLifecycleRepository } from '../../domain/interfaces/push-token-lifecycle.repository.interface';
import type { IPushTokenRepository } from '../../domain/interfaces/push-token.repository.interface';
import { RegisterPushTokenUseCase } from './register-push-token.use-case';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const input = {
  provider: 'fcm' as const,
  platform: 'android' as const,
  token: 'fcm-token',
  deviceId: 'installation-1',
  appVersion: '1.0.0',
  lifecycleVersion: 12,
};

const pushToken = new PushToken({
  id: 'push-token-id',
  userId: USER_ID,
  provider: 'fcm',
  platform: 'android',
  token: input.token,
  deviceId: input.deviceId,
  appVersion: input.appVersion,
  bundleId: null,
  deliveryEnvironment: null,
  isActive: true,
  lastSeenAt: new Date('2026-08-20T00:00:00.000Z'),
  createdAt: new Date('2026-08-20T00:00:00.000Z'),
  updatedAt: new Date('2026-08-20T00:00:00.000Z'),
});

describe('RegisterPushTokenUseCase', () => {
  let pushTokenRepository: {
    upsert: jest.Mock;
    deactivateRegistration: jest.Mock;
    deactivateOtherDeviceTokens: jest.Mock;
  };
  let lifecycleRepository: {
    acquireLock: jest.Mock;
    releaseLock: jest.Mock;
    advance: jest.Mock;
    isCurrent: jest.Mock;
    markTokenInvalidated: jest.Mock;
    isTokenInvalidated: jest.Mock;
  };
  let useCase: RegisterPushTokenUseCase;

  beforeEach(() => {
    pushTokenRepository = {
      upsert: jest.fn().mockResolvedValue(pushToken),
      deactivateRegistration: jest.fn().mockResolvedValue({ count: 0 }),
      deactivateOtherDeviceTokens: jest.fn().mockResolvedValue({ count: 0 }),
    };
    lifecycleRepository = {
      acquireLock: jest.fn().mockResolvedValue('lock-1'),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      advance: jest.fn().mockResolvedValue(true),
      isCurrent: jest.fn().mockResolvedValue(true),
      markTokenInvalidated: jest.fn().mockResolvedValue(undefined),
      isTokenInvalidated: jest.fn().mockResolvedValue(false),
    };
    useCase = new RegisterPushTokenUseCase(
      pushTokenRepository as unknown as IPushTokenRepository,
      lifecycleRepository,
    );
  });

  it('rejects lifecycle writes when the device lock cannot be acquired', async () => {
    lifecycleRepository.acquireLock.mockResolvedValue(null);

    await expect(useCase.execute(USER_ID, input)).rejects.toBeInstanceOf(
      PushTokenLifecycleConflictError,
    );

    expect(lifecycleRepository.advance).not.toHaveBeenCalled();
    expect(pushTokenRepository.upsert).not.toHaveBeenCalled();
    expect(lifecycleRepository.releaseLock).not.toHaveBeenCalled();
  });

  it('holds the device lock through registration and releases it afterwards', async () => {
    await expect(useCase.execute(USER_ID, input)).resolves.toBe(pushToken);

    expect(lifecycleRepository.acquireLock).toHaveBeenCalledWith(input);
    expect(lifecycleRepository.advance).toHaveBeenCalledWith(input, 'register');
    expect(lifecycleRepository.isTokenInvalidated).toHaveBeenCalledWith(input);
    expect(pushTokenRepository.upsert).toHaveBeenCalledWith(USER_ID, input);
    expect(lifecycleRepository.isCurrent).toHaveBeenCalledWith(
      input,
      'register',
    );
    expect(
      pushTokenRepository.deactivateOtherDeviceTokens,
    ).toHaveBeenCalledWith(USER_ID, input);
    expect(lifecycleRepository.releaseLock).toHaveBeenCalledWith(
      input,
      'lock-1',
    );

    expect(
      lifecycleRepository.releaseLock.mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      pushTokenRepository.deactivateOtherDeviceTokens.mock
        .invocationCallOrder[0],
    );
  });

  it('rejects FCM tokens that Firebase already marked terminal-invalid', async () => {
    lifecycleRepository.isTokenInvalidated.mockResolvedValue(true);

    await expect(useCase.execute(USER_ID, input)).rejects.toBeInstanceOf(
      FcmPushTokenInvalidatedError,
    );

    expect(pushTokenRepository.upsert).not.toHaveBeenCalled();
    expect(lifecycleRepository.releaseLock).toHaveBeenCalledWith(
      input,
      'lock-1',
    );
  });

  it('releases the device lock when the lifecycle has already advanced', async () => {
    lifecycleRepository.advance.mockResolvedValue(false);

    await expect(useCase.execute(USER_ID, input)).rejects.toBeInstanceOf(
      PushTokenLifecycleConflictError,
    );

    expect(pushTokenRepository.upsert).not.toHaveBeenCalled();
    expect(lifecycleRepository.releaseLock).toHaveBeenCalledWith(
      input,
      'lock-1',
    );
  });
});
