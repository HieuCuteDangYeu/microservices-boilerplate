import { of } from 'rxjs';
import { GroupMembersV2Controller } from './group-members-v2.controller';

describe('GroupMembersV2Controller', () => {
  it('uses authenticated user id instead of accepting requester identity from the client', async () => {
    const conversationClient = {
      send: jest.fn().mockReturnValue(
        of([
          {
            userId: 'member-id',
            role: 'ADMIN',
            status: 'ACTIVE',
            joinedAt: '2026-08-19T00:00:00.000Z',
          },
        ]),
      ),
    };
    const controller = new GroupMembersV2Controller(conversationClient as never);

    await expect(
      controller.getGroupMemberProjection('conversation-id', {
        id: 'authenticated-user-id',
      } as never),
    ).resolves.toEqual([
      expect.objectContaining({ userId: 'member-id', role: 'ADMIN' }),
    ]);

    expect(conversationClient.send).toHaveBeenCalledWith(
      'get_group_member_projection',
      {
        conversationId: 'conversation-id',
        requesterUserId: 'authenticated-user-id',
      },
    );
  });
});
