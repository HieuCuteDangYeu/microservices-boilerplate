import { InvalidResetTokenError } from '@auth/domain/errors/invalid-reset-token.error';
import { ResetPasswordUseCase } from './reset-password.use-case';

describe('ResetPasswordUseCase', () => {
  const dto = {
    token: '123456',
    newPassword: 'NewPassword123!',
  } as any;

  it('consumes the reset token before updating the password', async () => {
    const consumeUserId = jest.fn().mockResolvedValue('user-1');
    const updateUser = jest.fn().mockResolvedValue(undefined);
    const useCase = new ResetPasswordUseCase(
      { updateUser } as any,
      { consumeUserId } as any,
    );

    await expect(useCase.execute(dto)).resolves.toEqual({
      message: 'Password has been reset successfully.',
    });

    expect(consumeUserId).toHaveBeenCalledWith('reset_password:123456');
    expect(updateUser).toHaveBeenCalledWith({
      id: 'user-1',
      data: { password: 'NewPassword123!' },
    });
    expect(consumeUserId.mock.invocationCallOrder[0]).toBeLessThan(
      updateUser.mock.invocationCallOrder[0],
    );
  });

  it('rejects an already consumed or expired token without updating the user', async () => {
    const updateUser = jest.fn();
    const useCase = new ResetPasswordUseCase(
      { updateUser } as any,
      { consumeUserId: jest.fn().mockResolvedValue(null) } as any,
    );

    await expect(useCase.execute(dto)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );

    expect(updateUser).not.toHaveBeenCalled();
  });
});
