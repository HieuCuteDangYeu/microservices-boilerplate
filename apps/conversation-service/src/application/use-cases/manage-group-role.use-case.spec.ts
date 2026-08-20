import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity';
import { ManageGroupRoleUseCase } from './manage-group-role.use-case';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const JOINED_AT = new Date('2026-08-20T00:00:00.000Z');

const group = (creatorId = OWNER_ID) =>
  new Conversation({
    id: CONVERSATION_ID,
    creatorId,
    participantIds: [OWNER_ID, MEMBER_ID],
    isGroup: true,
    createdAt: JOINED_AT,
    updatedAt: JOINED_AT,
  });

const member = (role: 'OWNER' | 'ADMIN' | 'MEMBER') => ({
  id: 'member-record-id',
  conversationId: CONVERSATION_ID,
  userId: MEMBER_ID,
  role,
  status: 'ACTIVE' as const,
  joinedAt: JOINED_AT,
  invitedBy: OWNER_ID,
  leftAt: null,
  removedBy: null,
});

describe('ManageGroupRoleUseCase', () => {
  let chatRepository: any;
  let memberRepository: any;
  let configService: any;
  let useCase: ManageGroupRoleUseCase;

  beforeEach(() => {
    chatRepository = {
      findConversation: jest.fn().mockResolvedValue(group()),
    };
    memberRepository = {
      listByConversation: jest.fn().mockResolvedValue([member('MEMBER')]),
      changeRoleAsLegacyOwner: jest.fn().mockResolvedValue(true),
    };
    configService = {
      get: jest.fn().mockReturnValue('true'),
    };

    useCase = new ManageGroupRoleUseCase(
      chatRepository,
      memberRepository,
      configService,
    );
  });

  it('keeps role mutations disabled unless the rollout flag is explicitly enabled', async () => {
    configService.get.mockReturnValue('false');

    await expect(
      useCase.updateRole({
        conversationId: CONVERSATION_ID,
        actorUserId: OWNER_ID,
        targetUserId: MEMBER_ID,
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(memberRepository.changeRoleAsLegacyOwner).not.toHaveBeenCalled();
  });

  it('rejects a stale old owner before attempting a role mutation', async () => {
    chatRepository.findConversation.mockResolvedValue(group(MEMBER_ID));

    await expect(
      useCase.updateRole({
        conversationId: CONVERSATION_ID,
        actorUserId: OWNER_ID,
        targetUserId: MEMBER_ID,
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(memberRepository.changeRoleAsLegacyOwner).not.toHaveBeenCalled();
  });

  it('promotes an active regular member to admin through the guarded repository mutation', async () => {
    memberRepository.listByConversation
      .mockResolvedValueOnce([member('MEMBER')])
      .mockResolvedValueOnce([member('ADMIN')]);

    await expect(
      useCase.updateRole({
        conversationId: CONVERSATION_ID,
        actorUserId: OWNER_ID,
        targetUserId: MEMBER_ID,
        role: 'ADMIN',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        member: expect.objectContaining({
          userId: MEMBER_ID,
          role: 'ADMIN',
          status: 'ACTIVE',
        }),
      }),
    );

    expect(memberRepository.changeRoleAsLegacyOwner).toHaveBeenCalledWith(
      CONVERSATION_ID,
      OWNER_ID,
      MEMBER_ID,
      'MEMBER',
      'ADMIN',
    );
  });

  it('demotes an active admin to regular member', async () => {
    memberRepository.listByConversation
      .mockResolvedValueOnce([member('ADMIN')])
      .mockResolvedValueOnce([member('MEMBER')]);

    await expect(
      useCase.updateRole({
        conversationId: CONVERSATION_ID,
        actorUserId: OWNER_ID,
        targetUserId: MEMBER_ID,
        role: 'MEMBER',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        member: expect.objectContaining({ role: 'MEMBER' }),
      }),
    );

    expect(memberRepository.changeRoleAsLegacyOwner).toHaveBeenCalledWith(
      CONVERSATION_ID,
      OWNER_ID,
      MEMBER_ID,
      'ADMIN',
      'MEMBER',
    );
  });

  it('treats setting the current role as an idempotent success', async () => {
    memberRepository.listByConversation.mockResolvedValue([member('ADMIN')]);

    await expect(
      useCase.updateRole({
        conversationId: CONVERSATION_ID,
        actorUserId: OWNER_ID,
        targetUserId: MEMBER_ID,
        role: 'ADMIN',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        member: expect.objectContaining({ role: 'ADMIN' }),
      }),
    );

    expect(memberRepository.changeRoleAsLegacyOwner).not.toHaveBeenCalled();
  });

  it('accepts a concurrent duplicate role change as idempotent after the guarded write loses the race', async () => {
    memberRepository.changeRoleAsLegacyOwner.mockResolvedValue(false);
    memberRepository.listByConversation
      .mockResolvedValueOnce([member('MEMBER')])
      .mockResolvedValueOnce([member('ADMIN')]);

    await expect(
      useCase.updateRole({
        conversationId: CONVERSATION_ID,
        actorUserId: OWNER_ID,
        targetUserId: MEMBER_ID,
        role: 'ADMIN',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        member: expect.objectContaining({ role: 'ADMIN' }),
      }),
    );
  });

  it('rejects when ownership or role changed to a conflicting state during the final mutation', async () => {
    memberRepository.changeRoleAsLegacyOwner.mockResolvedValue(false);
    chatRepository.findConversation
      .mockResolvedValueOnce(group())
      .mockResolvedValueOnce(group(MEMBER_ID));

    await expect(
      useCase.updateRole({
        conversationId: CONVERSATION_ID,
        actorUserId: OWNER_ID,
        targetUserId: MEMBER_ID,
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to mutate roles when the projection is unavailable', async () => {
    memberRepository.listByConversation.mockRejectedValue(
      new Error('projection unavailable'),
    );

    await expect(
      useCase.updateRole({
        conversationId: CONVERSATION_ID,
        actorUserId: OWNER_ID,
        targetUserId: MEMBER_ID,
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
