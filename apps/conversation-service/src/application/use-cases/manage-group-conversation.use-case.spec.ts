import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity';
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import type { IConversationMutationRepository } from '../../domain/interfaces/conversation-mutation.repository.interface';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import { ManageGroupConversationUseCase } from './manage-group-conversation.use-case';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';
const NEW_MEMBER_ID = '44444444-4444-4444-8444-444444444444';

const group = (participantIds = [OWNER_ID, MEMBER_ID, THIRD_ID]) =>
  new Conversation({
    id: 'group-id',
    creatorId: OWNER_ID,
    participantIds,
    isGroup: true,
    name: 'Core Team',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
  });

describe('ManageGroupConversationUseCase', () => {
  let chatRepository: { findConversation: jest.Mock };
  let mutationRepository: {
    updateMetadataAsOwner: jest.Mock;
    addParticipantAsOwner: jest.Mock;
    transferOwnership: jest.Mock;
    removeParticipantAsOwner: jest.Mock;
    removeParticipantAsMember: jest.Mock;
    removeParticipant: jest.Mock;
  };
  let userService: { validateUsers: jest.Mock };
  let useCase: ManageGroupConversationUseCase;

  beforeEach(() => {
    chatRepository = { findConversation: jest.fn() };
    mutationRepository = {
      updateMetadataAsOwner: jest.fn().mockResolvedValue(true),
      addParticipantAsOwner: jest.fn().mockResolvedValue(true),
      transferOwnership: jest.fn().mockResolvedValue(true),
      removeParticipantAsOwner: jest.fn().mockResolvedValue(true),
      removeParticipantAsMember: jest.fn().mockResolvedValue(true),
      removeParticipant: jest.fn().mockResolvedValue(undefined),
    };
    userService = { validateUsers: jest.fn().mockResolvedValue(true) };
    useCase = new ManageGroupConversationUseCase(
      chatRepository as unknown as IChatRepository,
      mutationRepository as unknown as IConversationMutationRepository,
      userService as unknown as IUserService,
    );
  });

  it('allows the owner to update normalized group metadata', async () => {
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
    expect(result.name).toBe('Renamed');
  });

  it('rejects a stale metadata write after ownership changes', async () => {
    chatRepository.findConversation.mockResolvedValue(group());
    mutationRepository.updateMetadataAsOwner.mockResolvedValue(false);

    await expect(
      useCase.updateMetadata({
        conversationId: 'group-id',
        actorUserId: OWNER_ID,
        name: 'Stale rename',
      }),
    ).rejects.toThrow(
      'Group membership or ownership changed; refresh and try again',
    );
  });

  it('blocks metadata mutation by a non-owner group member', async () => {
    chatRepository.findConversation.mockResolvedValue(group());

    await expect(
      useCase.updateMetadata({
        conversationId: 'group-id',
        actorUserId: MEMBER_ID,
        name: 'Nope',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(mutationRepository.updateMetadataAsOwner).not.toHaveBeenCalled();
  });

  it('adds a validated member and returns the refreshed conversation', async () => {
    const before = group();
    const after = group([...before.participantIds, NEW_MEMBER_ID]);
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    const result = await useCase.addMember({
      conversationId: before.id,
      actorUserId: OWNER_ID,
      userId: NEW_MEMBER_ID,
    });

    expect(userService.validateUsers).toHaveBeenCalledWith([NEW_MEMBER_ID]);
    expect(mutationRepository.addParticipantAsOwner).toHaveBeenCalledWith(
      before.id,
      OWNER_ID,
      NEW_MEMBER_ID,
      expect.any(Date),
    );
    expect(result.added).toBe(true);
    expect(result.conversation.participantIds).toContain(NEW_MEMBER_ID);
  });

  it('rejects a stale add-member write after ownership changes', async () => {
    const before = group();
    const afterOwnershipTransfer = new Conversation({
      ...before,
      creatorId: MEMBER_ID,
    });
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(afterOwnershipTransfer);
    mutationRepository.addParticipantAsOwner.mockResolvedValue(false);

    await expect(
      useCase.addMember({
        conversationId: before.id,
        actorUserId: OWNER_ID,
        userId: NEW_MEMBER_ID,
      }),
    ).rejects.toThrow(
      'Group membership or ownership changed; refresh and try again',
    );
  });

  it('treats a concurrently-added member as an idempotent no-op', async () => {
    const before = group();
    const after = group([...before.participantIds, NEW_MEMBER_ID]);
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    mutationRepository.addParticipantAsOwner.mockResolvedValue(false);

    const result = await useCase.addMember({
      conversationId: before.id,
      actorUserId: OWNER_ID,
      userId: NEW_MEMBER_ID,
    });

    expect(result).toEqual({ conversation: after, added: false });
  });

  it('treats adding an existing member as an idempotent no-op', async () => {
    const before = group();
    chatRepository.findConversation.mockResolvedValue(before);

    const result = await useCase.addMember({
      conversationId: before.id,
      actorUserId: OWNER_ID,
      userId: MEMBER_ID,
    });

    expect(result).toEqual({ conversation: before, added: false });
    expect(userService.validateUsers).not.toHaveBeenCalled();
    expect(mutationRepository.addParticipantAsOwner).not.toHaveBeenCalled();
  });

  it('transfers ownership to an existing group member', async () => {
    const before = group();
    const after = new Conversation({ ...before, creatorId: MEMBER_ID });
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    const result = await useCase.transferOwnership({
      conversationId: before.id,
      actorUserId: OWNER_ID,
      userId: MEMBER_ID,
    });

    expect(mutationRepository.transferOwnership).toHaveBeenCalledWith(
      before.id,
      OWNER_ID,
      MEMBER_ID,
    );
    expect(result.creatorId).toBe(MEMBER_ID);
  });

  it('blocks ownership transfer by a non-owner member', async () => {
    chatRepository.findConversation.mockResolvedValue(group());

    await expect(
      useCase.transferOwnership({
        conversationId: 'group-id',
        actorUserId: MEMBER_ID,
        userId: THIRD_ID,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(mutationRepository.transferOwnership).not.toHaveBeenCalled();
  });

  it('requires the new owner to already be a group member', async () => {
    chatRepository.findConversation.mockResolvedValue(group());

    await expect(
      useCase.transferOwnership({
        conversationId: 'group-id',
        actorUserId: OWNER_ID,
        userId: NEW_MEMBER_ID,
      }),
    ).rejects.toThrow('New owner must be an existing group member');

    expect(mutationRepository.transferOwnership).not.toHaveBeenCalled();
  });

  it('rejects a stale ownership transfer when membership changed concurrently', async () => {
    chatRepository.findConversation.mockResolvedValue(group());
    mutationRepository.transferOwnership.mockResolvedValue(false);

    await expect(
      useCase.transferOwnership({
        conversationId: 'group-id',
        actorUserId: OWNER_ID,
        userId: MEMBER_ID,
      }),
    ).rejects.toThrow(
      'Group membership or ownership changed; refresh and try again',
    );
  });

  it('never allows the owner to be removed', async () => {
    chatRepository.findConversation.mockResolvedValue(group());

    await expect(
      useCase.removeMember({
        conversationId: 'group-id',
        actorUserId: OWNER_ID,
        userId: OWNER_ID,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mutationRepository.removeParticipantAsOwner).not.toHaveBeenCalled();
  });

  it('keeps the minimum two-member invariant', async () => {
    chatRepository.findConversation.mockResolvedValue(
      group([OWNER_ID, MEMBER_ID]),
    );

    await expect(
      useCase.removeMember({
        conversationId: 'group-id',
        actorUserId: OWNER_ID,
        userId: MEMBER_ID,
      }),
    ).rejects.toThrow('A group must keep at least 2 participants');
  });

  it('allows the current owner to remove a regular member', async () => {
    const before = group();
    const after = group([OWNER_ID, THIRD_ID]);
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    const result = await useCase.removeMember({
      conversationId: before.id,
      actorUserId: OWNER_ID,
      userId: MEMBER_ID,
    });

    expect(mutationRepository.removeParticipantAsOwner).toHaveBeenCalledWith(
      before.id,
      OWNER_ID,
      MEMBER_ID,
    );
    expect(result.participantIds).not.toContain(MEMBER_ID);
  });

  it('rejects a stale owner removal if ownership changes concurrently', async () => {
    chatRepository.findConversation.mockResolvedValue(group());
    mutationRepository.removeParticipantAsOwner.mockResolvedValue(false);

    await expect(
      useCase.removeMember({
        conversationId: 'group-id',
        actorUserId: OWNER_ID,
        userId: MEMBER_ID,
      }),
    ).rejects.toThrow(
      'Group membership or ownership changed; refresh and try again',
    );
  });

  it('allows a non-owner member to leave a group with three or more members', async () => {
    const before = group();
    const after = group([OWNER_ID, THIRD_ID]);
    chatRepository.findConversation
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    const result = await useCase.leave({
      conversationId: before.id,
      actorUserId: MEMBER_ID,
    });

    expect(mutationRepository.removeParticipantAsMember).toHaveBeenCalledWith(
      before.id,
      MEMBER_ID,
    );
    expect(result.participantIds).not.toContain(MEMBER_ID);
  });

  it('rejects leave if the member becomes owner concurrently', async () => {
    chatRepository.findConversation.mockResolvedValue(group());
    mutationRepository.removeParticipantAsMember.mockResolvedValue(false);

    await expect(
      useCase.leave({
        conversationId: 'group-id',
        actorUserId: MEMBER_ID,
      }),
    ).rejects.toThrow(
      'Group membership or ownership changed; refresh and try again',
    );
  });

  it('requires the current owner to transfer ownership before leaving', async () => {
    chatRepository.findConversation.mockResolvedValue(group());

    await expect(
      useCase.leave({
        conversationId: 'group-id',
        actorUserId: OWNER_ID,
      }),
    ).rejects.toThrow('The group owner must transfer ownership before leaving');
  });
});
