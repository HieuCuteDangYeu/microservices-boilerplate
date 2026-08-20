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
  let useCase: CreateConversationUseCase;

  beforeEach(() => {
    chatRepository = {
      createConversation: jest.fn(async (conversation: Conversation) =>
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
    useCase = new CreateConversationUseCase(
      chatRepository as unknown as IChatRepository,
      userService as unknown as IUserService,
      consistencyService as never,
    );
  });

  it('creates a two-member GROUP when the explicit type is GROUP and shadow checks its projection', async () => {
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
  });

  it('does not shadow check a newly-created direct conversation', async () => {
    await useCase.execute(
      { participantIds: [PEER_ID], type: 'DIRECT' },
      OWNER_ID,
    );

    expect(chatRepository.createConversation).toHaveBeenCalledTimes(1);
    expect(consistencyService.checkAfterMutation).not.toHaveBeenCalled();
  });

  it('rejects conflicting type and legacy isGroup values', async () => {
    await expect(
      useCase.execute(
        { participantIds: [PEER_ID], type: 'GROUP', isGroup: false },
        OWNER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(userService.validateUsers).not.toHaveBeenCalled();
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
    ).rejects.toThrow('Group metadata is only supported for group conversations');
  });
});