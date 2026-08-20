import { RpcException } from '@nestjs/microservices';
import { GroupMembersMicroserviceController } from './group-members.controller';

describe('GroupMembersMicroserviceController', () => {
  it('forwards requester identity to the V2 member use case', async () => {
    const useCase = {
      execute: jest.fn().mockResolvedValue([
        {
          userId: 'user-id',
          role: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: '2026-08-19T00:00:00.000Z',
        },
      ]),
    };
    const controller = new GroupMembersMicroserviceController(useCase as never);

    await expect(
      controller.handleGetGroupMemberProjection({
        conversationId: 'conversation-id',
        requesterUserId: 'requester-id',
      }),
    ).resolves.toEqual([
      expect.objectContaining({ userId: 'user-id', role: 'MEMBER' }),
    ]);

    expect(useCase.execute).toHaveBeenCalledWith(
      'conversation-id',
      'requester-id',
    );
  });

  it('maps use-case failures to an RMQ exception', async () => {
    const useCase = {
      execute: jest.fn().mockRejectedValue(new Error('forbidden')),
    };
    const controller = new GroupMembersMicroserviceController(useCase as never);

    await expect(
      controller.handleGetGroupMemberProjection({
        conversationId: 'conversation-id',
        requesterUserId: 'requester-id',
      }),
    ).rejects.toBeInstanceOf(RpcException);
  });
});
