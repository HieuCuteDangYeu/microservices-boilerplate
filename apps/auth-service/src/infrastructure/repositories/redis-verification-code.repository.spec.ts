import { RedisVerificationCodeRepository } from './redis-verification-code.repository';

describe('RedisVerificationCodeRepository', () => {
  it('atomically consumes a verification code with GETDEL', async () => {
    const getdel = jest.fn().mockResolvedValue('user-1');
    const repository = new RedisVerificationCodeRepository({ getdel } as any);

    await expect(
      repository.consumeUserId('reset_password:123456'),
    ).resolves.toBe('user-1');

    expect(getdel).toHaveBeenCalledWith('verify:reset_password:123456');
  });
});
