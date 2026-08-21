import { BadRequestException } from '@nestjs/common';
import type { IUserService } from '../../domain/interfaces/user-service.interface';
import { Conversation } from '../../domain/entities/conversation.entity';
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import { CreateConversationUseCase } from './create-conversastion.use-case';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const PEER_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';

describe('CreateConversationUseCase', () => {
  let chatRepository: jest.Mocked<
    Pick<IChatRepository, 'createConversation' | 'findPrivateConversation'>
  >;
  let userService: jest.Mocked<Pick<IUserService, 'validateUsers'>>;
  let consistencyService: { checkAfterMutation: jest.Mock };
  let activityService: { publish: jest.Mock };
  let useCase: CreateConversationUseCase;

  beforeEach(() => {
    chatRepository = {
      createConversation: jest.fn(
        async (conversation: Conversation) =>
          new Conversation({ ...conversation, id: 'conversation-id' }),
      ),
      findPrivateConversation: jest.fn().mockResolvedValue(null),
    };
    userService = {
      validateUsers: jest.fn().mockResolvedValue(true),
    };
    consistencyService = {
      checkAfterMutation: jest.fn().mockResolvedValue(null),
    };
    activityService = { publish: jest.fn() };
    useCase = new CreateConversationUseCase(
      chatRepository as unknown as IChatRepository,
      userService as unknown as IUserService,
      consistencyService as never,
      activityService as never,
    );
  });

  it('creates a two-member GROUP, shadow checks its projection, and publishes one creation activity', async () => {
    const result = await useCase.execute(
      {
        participantIds: [PEER_ID],
        type: 'GROUP',
        name: '  Core Team  ',
      },
      OWNER_ID,
    );

    expect(result.created).toBe(true);
    expect(chatRepository.findPrivateConversation).not.toHaveBeenCalled();
    expect(chatRepository.createConversation).toHaveBeenCalledTimes(1);

    const created = chatRepository.createConversation.mock.calls[0][0];
    expect(created.isGroup).toBe(true);
    expect(created.participantIds).toEqual([PEER_ID, OWNER_ID]);
    expect(created.name).toBe('Core Team');
    expect(created.memberJoinedAt?.[OWNER_ID]).toBeDefined();
    expect(created.memberJoinedAt?.[PEER_ID]).toBeDefined();
    expect(consistencyService.checkAfterMutation).toHaveBeenCalledWith(
      'conversation-id',
      'create-group',
    );
    expect(activityService.publish).toHaveBeenCalledTimes(1);
    expect(activityService.publish).toHaveBeenCalledWith({
      conversationId: 'conversation-id',
      type: 'GROUP_CREATED',
      actorUserId: OWNER_ID,
    });
  });

  it('keeps legacy isGroup=false direct creation compatible and reuses an existing direct chat', async () => {
    const existing = new Conversation({
      id: 'existing-direct',
      creatorId: OWNER_ID,
      participantIds: [OWNER_ID, PEER_ID],
      isGroup: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    chatRepository.findPrivateConversation.mockResolvedValue(existing);

    const result = await useCase.execute(
      { participantIds: [PEER_ID], isGroup: false },
      OWNER_ID,
    );

    expect(result).toEqual({ conversation: existing, created: false });
    expect(chatRepository.createConversation).not.toHaveBeenCalled();
    expect(consistencyService.checkAfterMutation).not.toHaveBeenCalled();
    expect(activityService.publish).not.toHaveBeenCalled();
  });

  it('does not shadow check or publish activity for a newly-created direct conversation', async () => {
    await useCase.execute(
      { participantIds: [PEER_ID], type: 'DIRECT' },
      OWNER_ID,
    );

    expect(chatRepository.createConversation).toHaveBeenCalledTimes(1);
    expect(consistencyService.checkAfterMutation).not.toHaveBeenCalled();
    expect(activityService.publish).not.toHaveBeenCalled();
  });

  it('rejects conflicting type and legacy isGroup values', async () => {
    await expect(
      useCase.execute(
        { participantIds: [PEER_ID], type: 'GROUP', isGroup: false },
        OWNER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(userService.validateUsers).not.toHaveBeenCalled();
    expect(activityService.publish).not.toHaveBeenCalled();
  });

  it('rejects a DIRECT conversation with more than two final participants', async () => {
    await expect(
      useCase.execute(
        { participantIds: [PEER_ID, THIRD_ID], type: 'DIRECT' },
        OWNER_ID,
      ),
    ).rejects.toThrow('Direct conversations must have exactly 2 participants');
  });

  it('rejects group-only metadata on a DIRECT conversation', async () => {
    await expect(
      useCase.execute(
        { participantIds: [PEER_ID], type: 'DIRECT', name: 'Not a group' },
        OWNER_ID,
      ),
    ).rejects.toThrow(
      'Group metadata is only supported for group conversations',
    );
  });
});
