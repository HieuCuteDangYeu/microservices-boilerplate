import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity';
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import type { IConversationMemberRepository } from '../../domain/interfaces/conversation-member.repository.interface';
import type { IConversationMutationRepository } from '../../domain/interfaces/conversation-mutation.repository.interface';
import type { IGroupManagementV2Repository } from '../../domain/interfaces/group-management-v2.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import { ManageGroupConversationUseCase } from './manage-group-conversation.use-case';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';
const NEW_MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const CREATED_AT = new Date('2026-08-19T00:00:00.000Z');

const group = (
  participantIds = [OWNER_ID, ADMIN_ID, MEMBER_ID],
  creatorId = OWNER_ID,
) =>
  new Conversation({
    id: 'group-id',
    creatorId,
    participantIds,
    participants: participantIds.map((id) => ({
      id,
      email: `${id.slice(0, 8)}@example.com`,
      fullName:
        id === OWNER_ID
          ? 'Owner User'
          : id === ADMIN_ID
            ? 'Admin User'
            : id === MEMBER_ID
              ? 'Member User'
              : 'New Member',
    })),
    memberJoinedAt: Object.fromEntries(
      participantIds.map((id) => [id, CREATED_AT.toISOString()]),
    ),
    isGroup: true,
    name: 'Core Team',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

const projectedMembers = () => [
  {
    id: 'owner-record',
    conversationId: 'group-id',
    userId: OWNER_ID,
    role: 'OWNER' as const,
    status: 'ACTIVE' as const,
    joinedAt: CREATED_AT,
  },
  {
    id: 'admin-record',
    conversationId: 'group-id',
    userId: ADMIN_ID,
    role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
    joinedAt: CREATED_AT,
  },
  {
    id: 'member-record',
    conversationId: 'group-id',
    userId: MEMBER_ID,
    role: 'MEMBER' as const,
    status: 'ACTIVE' as const,
    joinedAt: CREATED_AT,
  },
];

describe('ManageGroupConversationUseCase', () => {
  let adminPermissionsEnabled: boolean;
  let chatRepository: { findConversation: jest.Mock };
  let mutationRepository: {
    updateMetadataAsOwner: jest.Mock;
    addParticipantAsOwner: jest.Mock;
    transferOwnership: jest.Mock;
    removeParticipantAsOwner: jest.Mock;
    removeParticipantAsMember: jest.Mock;
    removeParticipant: jest.Mock;
  };
  let memberRepository: {
    listByConversation: jest.Mock;
    changeRoleAsLegacyOwner: jest.Mock;
  };
  let v2Repository: {
    updateMetadataWithRoleGuard: jest.Mock;
    addParticipantWithRoleGuard: jest.Mock;
    removeParticipantWithRoleGuard: jest.Mock;
    leaveParticipantWithRoleGuard: jest.Mock;
    transferOwnershipWithRoleGuard: jest.Mock;
  };
  let userService: { validateUsers: jest.Mock };
  let consistencyService: { checkAfterMutation: jest.Mock };
  let activityService: { publish: jest.Mock };
  let configService: { get: jest.Mock };
  let useCase: ManageGroupConversationUseCase;

  beforeEach(() => {
    adminPermissionsEnabled = false;
    chatRepository = { findConversation: jest.fn() };
    mutationRepository = {
      updateMetadataAsOwner: jest.fn().mockResolvedValue(true),
      addParticipantAsOwner: jest.fn().mockResolvedValue(true),
      transferOwnership: jest.fn().mockResolvedValue(true),
      removeParticipantAsOwner: jest.fn().mockResolvedValue(true),
      removeParticipantAsMember: jest.fn().mockResolvedValue(true),
      removeParticipant: jest.fn().mockResolvedValue(undefined),
    };
    memberRepository = {
      listByConversation: jest.fn().mockResolvedValue(projectedMembers()),
      changeRoleAsLegacyOwner: jest.fn(),
    };
    v2Repository = {
      updateMetadataWithRoleGuard: jest.fn().mockResolvedValue(true),
      addParticipantWithRoleGuard: jest.fn().mockResolvedValue(true),
      removeParticipantWithRoleGuard: jest.fn().mockResolvedValue(true),
      leaveParticipantWithRoleGuard: jest.fn().mockResolvedValue(true),
      transferOwnershipWithRoleGuard: jest.fn().mockResolvedValue(true),
    };
    userService = { validateUsers: jest.fn().mockResolvedValue(true) };
    consistencyService = {
      checkAfterMutation: jest.fn().mockResolvedValue(null),
    };
    activityService = { publish: jest.fn() };
    configService = {
      get: jest.fn((_key: string, fallback: string) =>
        adminPermissionsEnabled ? 'true' : fallback,
      ),
    };

    useCase = new ManageGroupConversationUseCase(
      chatRepository as unknown as IChatRepository,
      mutationRepository as unknown as IConversationMutationRepository,
      memberRepository as unknown as IConversationMemberRepository,
      v2Repository as unknown as IGroupManagementV2Repository,
      userService as unknown as IUserService,
      configService as never,
      consistencyService as never,
      activityService as never,
    );
  });

  it('keeps the legacy owner-only metadata path while the V2 permission flag is off', async () => {
    const before = group();
    const after = new Conversation({ ...before, name: 'Renamed' });
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    const result = await useCase.updateMetadata({
      conversationId: before.id,
      actorUserId: OWNER_ID,
      name: '  Renamed  ',
    });

    expect(mutationRepository.updateMetadataAsOwner).toHaveBeenCalledWith(
      before.id,
      OWNER_ID,
      { name: 'Renamed' },
    );
    expect(v2Repository.updateMetadataWithRoleGuard).not.toHaveBeenCalled();
    expect(result.name).toBe('Renamed');
    expect(activityService.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GROUP_RENAMED', actorUserId: OWNER_ID }),
    );
  });

  it('keeps a non-owner blocked while the V2 permission flag is off', async () => {
    chatRepository.findConversation.mockResolvedValue(group());

    await expect(
      useCase.updateMetadata({
        conversationId: 'group-id',
        actorUserId: ADMIN_ID,
        name: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an ACTIVE admin to rename the group through the guarded V2 repository', async () => {
    adminPermissionsEnabled = true;
    const before = group();
    const after = new Conversation({ ...before, name: 'Admin Renamed' });
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    await useCase.updateMetadata({
      conversationId: before.id,
      actorUserId: ADMIN_ID,
      name: 'Admin Renamed',
    });

    expect(v2Repository.updateMetadataWithRoleGuard).toHaveBeenCalledWith(
      before.id,
      ADMIN_ID,
      'ADMIN',
      { name: 'Admin Renamed' },
    );
    expect(mutationRepository.updateMetadataAsOwner).not.toHaveBeenCalled();
  });

  it('allows an ACTIVE admin to add a member and emits one activity', async () => {
    adminPermissionsEnabled = true;
    const before = group();
    const after = group([...before.participantIds, NEW_MEMBER_ID]);
    memberRepository.listByConversation.mockResolvedValue(projectedMembers());
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    const result = await useCase.addMember({
      conversationId: before.id,
      actorUserId: ADMIN_ID,
      userId: NEW_MEMBER_ID,
    });

    expect(v2Repository.addParticipantWithRoleGuard).toHaveBeenCalledWith(
      before.id,
      ADMIN_ID,
      'ADMIN',
      NEW_MEMBER_ID,
      expect.any(Date),
    );
    expect(result.added).toBe(true);
    expect(activityService.publish).toHaveBeenCalledTimes(1);
    expect(activityService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MEMBER_ADDED',
        actorUserId: ADMIN_ID,
        targetUserId: NEW_MEMBER_ID,
      }),
    );
  });

  it('does not emit an add activity for an existing member no-op', async () => {
    adminPermissionsEnabled = true;
    const before = group();
    chatRepository.findConversation.mockResolvedValue(before);

    const result = await useCase.addMember({
      conversationId: before.id,
      actorUserId: ADMIN_ID,
      userId: MEMBER_ID,
    });

    expect(result).toEqual({ conversation: before, added: false });
    expect(v2Repository.addParticipantWithRoleGuard).not.toHaveBeenCalled();
    expect(activityService.publish).not.toHaveBeenCalled();
  });

  it('blocks a regular member from adding members in V2 mode', async () => {
    adminPermissionsEnabled = true;
    chatRepository.findConversation.mockResolvedValue(group());

    await expect(
      useCase.addMember({
        conversationId: 'group-id',
        actorUserId: MEMBER_ID,
        userId: NEW_MEMBER_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(v2Repository.addParticipantWithRoleGuard).not.toHaveBeenCalled();
  });

  it('allows an admin to remove a regular member but not another admin', async () => {
    adminPermissionsEnabled = true;
    const before = group();
    const after = group([OWNER_ID, ADMIN_ID]);
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    await useCase.removeMember({
      conversationId: before.id,
      actorUserId: ADMIN_ID,
      userId: MEMBER_ID,
    });

    expect(v2Repository.removeParticipantWithRoleGuard).toHaveBeenCalledWith(
      before.id,
      ADMIN_ID,
      'ADMIN',
      MEMBER_ID,
      'MEMBER',
      expect.any(Date),
    );

    chatRepository.findConversation.mockReset().mockResolvedValue(group());
    memberRepository.listByConversation.mockResolvedValue(projectedMembers());

    await expect(
      useCase.removeMember({
        conversationId: 'group-id',
        actorUserId: ADMIN_ID,
        userId: ADMIN_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the owner to remove an admin in V2 mode', async () => {
    adminPermissionsEnabled = true;
    const before = group();
    const after = group([OWNER_ID, MEMBER_ID]);
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    await useCase.removeMember({
      conversationId: before.id,
      actorUserId: OWNER_ID,
      userId: ADMIN_ID,
    });

    expect(v2Repository.removeParticipantWithRoleGuard).toHaveBeenCalledWith(
      before.id,
      OWNER_ID,
      'OWNER',
      ADMIN_ID,
      'ADMIN',
      expect.any(Date),
    );
  });

  it('transfers ownership through one guarded V2 transaction', async () => {
    adminPermissionsEnabled = true;
    const before = group();
    const after = group([OWNER_ID, ADMIN_ID, MEMBER_ID], MEMBER_ID);
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    const result = await useCase.transferOwnership({
      conversationId: before.id,
      actorUserId: OWNER_ID,
      userId: MEMBER_ID,
    });

    expect(v2Repository.transferOwnershipWithRoleGuard).toHaveBeenCalledWith(
      before.id,
      OWNER_ID,
      MEMBER_ID,
      'MEMBER',
    );
    expect(result.creatorId).toBe(MEMBER_ID);
  });

  it('allows an admin to leave through the guarded V2 path', async () => {
    adminPermissionsEnabled = true;
    const before = group();
    const after = group([OWNER_ID, MEMBER_ID]);
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    await useCase.leave({
      conversationId: before.id,
      actorUserId: ADMIN_ID,
    });

    expect(v2Repository.leaveParticipantWithRoleGuard).toHaveBeenCalledWith(
      before.id,
      ADMIN_ID,
      'ADMIN',
      expect.any(Date),
    );
    expect(activityService.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MEMBER_LEFT', actorUserId: ADMIN_ID }),
    );
  });

  it('still requires the owner to transfer ownership before leaving', async () => {
    adminPermissionsEnabled = true;
    chatRepository.findConversation.mockResolvedValue(group());

    await expect(
      useCase.leave({
        conversationId: 'group-id',
        actorUserId: OWNER_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the projection member set drifts from legacy', async () => {
    adminPermissionsEnabled = true;
    chatRepository.findConversation.mockResolvedValue(group());
    memberRepository.listByConversation.mockResolvedValue(
      projectedMembers().filter((member) => member.userId !== MEMBER_ID),
    );

    await expect(
      useCase.updateMetadata({
        conversationId: 'group-id',
        actorUserId: ADMIN_ID,
        name: 'Drifted',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(v2Repository.updateMetadataWithRoleGuard).not.toHaveBeenCalled();
  });

  it('keeps the minimum two-member invariant before invoking V2 removal', async () => {
    adminPermissionsEnabled = true;
    const twoMemberGroup = group([OWNER_ID, MEMBER_ID]);
    chatRepository.findConversation.mockResolvedValue(twoMemberGroup);

    await expect(
      useCase.removeMember({
        conversationId: 'group-id',
        actorUserId: OWNER_ID,
        userId: MEMBER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(v2Repository.removeParticipantWithRoleGuard).not.toHaveBeenCalled();
  });
});
