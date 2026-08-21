import { RpcException } from '@nestjs/microservices';
import { GroupMembersMicroserviceController } from './group-members.controller';

describe('GroupMembersMicroserviceController', () => {
  const createController = (overrides?: {
    getUseCase?: any;
    roleUseCase?: any;
    chatGateway?: any;
  }) => {
    const getUseCase =
      overrides?.getUseCase ??
      ({ execute: jest.fn().mockResolvedValue([]) } as any);
    const roleUseCase =
      overrides?.roleUseCase ??
      ({ updateRole: jest.fn() } as any);
    const chatGateway =
      overrides?.chatGateway ??
      ({ emitConversationUpdated: jest.fn() } as any);

    return {
      controller: new GroupMembersMicroserviceController(
        getUseCase,
        roleUseCase,
        chatGateway,
      ),
      getUseCase,
      roleUseCase,
      chatGateway,
    };
  };

  it('forwards requester identity to the V2 member use case', async () => {
    const getUseCase = {
      execute: jest.fn().mockResolvedValue([
        {
          userId: 'user-id',
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: '2026-08-19T00:00:00.000Z',
        },
      ]),
    };
    const { controller } = createController({ getUseCase });

    await expect(
      controller.handleGetGroupMemberProjection({
        conversationId: 'conversation-id',
        requesterUserId: 'requester-id',
      }),
    ).resolves.toEqual([
      expect.objectContaining({ userId: 'user-id', role: 'MEMBER' }),
    ]);

    expect(getUseCase.execute).toHaveBeenCalledWith(
      'conversation-id',
      'requester-id',
    );
  });

  it('emits the existing conversation_updated lifecycle event after a real role mutation', async () => {
    const conversation = {
      id: 'conversation-id',
      participantIds: ['owner-id', 'member-id'],
    };
    const roleUseCase = {
      updateRole: jest.fn().mockResolvedValue({
        conversation,
        changed: true,
        member: {
          userId: 'member-id',
          role: 'ADMIN',
          status: 'ACTIVE',
          joinedAt: '2026-08-19T00:00:00.000Z',
        },
      }),
    };
    const chatGateway = { emitConversationUpdated: jest.fn() };
    const { controller } = createController({ roleUseCase, chatGateway });

    await expect(
      controller.handleUpdateGroupMemberRole({
        conversationId: 'conversation-id',
        actorUserId: 'owner-id',
        targetUserId: 'member-id',
        role: 'ADMIN',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ userId: 'member-id', role: 'ADMIN' }),
    );

    expect(roleUseCase.updateRole).toHaveBeenCalledWith({
      conversationId: 'conversation-id',
      actorUserId: 'owner-id',
      targetUserId: 'member-id',
      role: 'ADMIN',
    });
    expect(chatGateway.emitConversationUpdated).toHaveBeenCalledWith(
      conversation,
    );
  });

  it('does not emit a duplicate conversation_updated event for an idempotent role request', async () => {
    const conversation = {
      id: 'conversation-id',
      participantIds: ['owner-id', 'member-id'],
    };
    const roleUseCase = {
      updateRole: jest.fn().mockResolvedValue({
        conversation,
        changed: false,
        member: {
          userId: 'member-id',
          role: 'ADMIN',
          status: 'ACTIVE',
          joinedAt: '2026-08-19T00:00:00.000Z',
        },
      }),
    };
    const chatGateway = { emitConversationUpdated: jest.fn() };
    const { controller } = createController({ roleUseCase, chatGateway });

    await expect(
      controller.handleUpdateGroupMemberRole({
        conversationId: 'conversation-id',
        actorUserId: 'owner-id',
        targetUserId: 'member-id',
        role: 'ADMIN',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ userId: 'member-id', role: 'ADMIN' }),
    );

    expect(chatGateway.emitConversationUpdated).not.toHaveBeenCalled();
  });

  it('maps member-list use-case failures to an RMQ exception', async () => {
    const getUseCase = {
      execute: jest.fn().mockRejectedValue(new Error('forbidden')),
    };
    const { controller } = createController({ getUseCase });

    await expect(
      controller.handleGetGroupMemberProjection({
        conversationId: 'conversation-id',
        requesterUserId: 'requester-id',
      }),
    ).rejects.toBeInstanceOf(RpcException);
  });

  it('maps role mutation failures to an RMQ exception without emitting an update', async () => {
    const roleUseCase = {
      updateRole: jest.fn().mockRejectedValue(new Error('role conflict')),
    };
    const chatGateway = { emitConversationUpdated: jest.fn() };
    const { controller } = createController({ roleUseCase, chatGateway });

    await expect(
      controller.handleUpdateGroupMemberRole({
        conversationId: 'conversation-id',
        actorUserId: 'owner-id',
        targetUserId: 'member-id',
        role: 'MEMBER',
      }),
    ).rejects.toBeInstanceOf(RpcException);

    expect(chatGateway.emitConversationUpdated).not.toHaveBeenCalled();
  });
});
