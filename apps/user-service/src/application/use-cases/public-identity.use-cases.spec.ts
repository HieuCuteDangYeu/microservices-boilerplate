import { CheckUsernameAvailabilityUseCase } from '@user/application/use-cases/check-username-availability.use-case';
import { CreateUserUseCase } from '@user/application/use-cases/create-user.use-case';
import { FindPublicUserByUsernameUseCase } from '@user/application/use-cases/find-public-user-by-username.use-case';
import { SearchPublicUsersUseCase } from '@user/application/use-cases/search-public-users.use-case';
import { UpdateUserUseCase } from '@user/application/use-cases/update-user.use-case';
import { User } from '@user/domain/entities/user.entity';
import { UsernameAlreadyTakenError } from '@user/domain/errors/username-already-taken.error';
import { UsernameNotFoundError } from '@user/domain/errors/username-not-found.error';
import type { IAuthService } from '@user/domain/interfaces/auth-service.interface';
import type { IUserRepository } from '@user/domain/interfaces/user.repository.interface';

describe('Public Identity Use Cases', () => {
  let userRepository: jest.Mocked<IUserRepository>;
  let authService: jest.Mocked<IAuthService>;

  beforeEach(() => {
    userRepository = {
      save: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByUsername: jest.fn(),
      findByIds: jest.fn(),
      findAll: jest.fn(),
      searchPublicUsers: jest.fn(),
      isUsernameAvailable: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      countUsersByIds: jest.fn(),
    };

    authService = {
      assignRole: jest.fn(),
      deleteUserRoles: jest.fn(),
    };
  });

  it('creates a fallback fullName and username for email-only signups', async () => {
    const useCase = new CreateUserUseCase(userRepository, authService);

    userRepository.findByEmail.mockResolvedValue(null);
    userRepository.isUsernameAvailable.mockResolvedValue(true);
    userRepository.save.mockImplementation((user) =>
      Promise.resolve(
        new User(
          'user-1',
          user.email,
          user.fullName,
          user.username,
          user.password,
          user.isVerified,
          new Date('2026-05-17T00:00:00.000Z'),
          user.picture,
          user.provider,
          user.providerId,
        ),
      ),
    );

    const result = await useCase.execute({
      email: 'john.doe@example.com',
      password: 'password123',
      isVerified: false,
    });

    expect(userRepository.save.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        email: 'john.doe@example.com',
        fullName: 'John Doe',
        username: 'john_doe',
      }),
    );
    expect(result).toMatchObject({
      id: 'user-1',
      fullName: 'John Doe',
      username: 'john_doe',
    });
  });

  it('rejects an explicit username that is already taken during create', async () => {
    const useCase = new CreateUserUseCase(userRepository, authService);

    userRepository.findByEmail.mockResolvedValue(null);
    userRepository.isUsernameAvailable.mockResolvedValue(false);

    await expect(
      useCase.execute({
        email: 'alice@example.com',
        password: 'password123',
        username: '@taken_name',
        isVerified: false,
      }),
    ).rejects.toBeInstanceOf(UsernameAlreadyTakenError);
  });

  it('normalizes usernames for availability checks', async () => {
    const useCase = new CheckUsernameAvailabilityUseCase(userRepository);

    userRepository.isUsernameAvailable.mockResolvedValue(true);

    const result = await useCase.execute('@Case_User');

    expect(userRepository.isUsernameAvailable.mock.calls[0]).toEqual([
      'case_user',
    ]);
    expect(result).toEqual({
      username: 'case_user',
      available: true,
    });
  });

  it('searches public users with @handle queries and excludes the requester', async () => {
    const useCase = new SearchPublicUsersUseCase(userRepository);

    userRepository.searchPublicUsers.mockResolvedValue([
      new User(
        'user-2',
        'friend@example.com',
        'Friend User',
        'friend_user',
        null,
        true,
        new Date('2026-05-17T00:00:00.000Z'),
        'https://cdn.example.com/avatar.png',
        null,
        null,
      ),
    ]);

    const result = await useCase.execute('@friend_user', 10, 'user-1');

    expect(userRepository.searchPublicUsers.mock.calls[0]?.[0]).toEqual({
      query: 'friend_user',
      limit: 10,
      excludeUserId: 'user-1',
    });
    expect(result).toEqual([
      {
        id: 'user-2',
        fullName: 'Friend User',
        username: 'friend_user',
        picture: 'https://cdn.example.com/avatar.png',
      },
    ]);
  });

  it('normalizes username updates before checking uniqueness', async () => {
    const useCase = new UpdateUserUseCase(userRepository);

    userRepository.isUsernameAvailable.mockResolvedValue(false);

    await expect(
      useCase.execute({
        id: 'user-1',
        data: { username: '@Taken_Name' },
      }),
    ).rejects.toBeInstanceOf(UsernameAlreadyTakenError);

    expect(userRepository.isUsernameAvailable.mock.calls[0]).toEqual([
      'taken_name',
      'user-1',
    ]);
  });

  it('looks up public profiles by normalized username', async () => {
    const useCase = new FindPublicUserByUsernameUseCase(userRepository);

    userRepository.findByUsername.mockResolvedValue(
      new User(
        'user-3',
        'public@example.com',
        'Public User',
        'public_user',
        null,
        true,
        new Date('2026-05-17T00:00:00.000Z'),
        null,
        null,
        null,
      ),
    );

    const result = await useCase.execute('@Public_User');

    expect(userRepository.findByUsername.mock.calls[0]).toEqual([
      'public_user',
    ]);
    expect(result).toEqual({
      id: 'user-3',
      fullName: 'Public User',
      username: 'public_user',
      picture: null,
    });
  });

  it('throws a username-based not found error for missing public profiles', async () => {
    const useCase = new FindPublicUserByUsernameUseCase(userRepository);

    userRepository.findByUsername.mockResolvedValue(null);

    await expect(useCase.execute('missing_user')).rejects.toBeInstanceOf(
      UsernameNotFoundError,
    );
  });
});
