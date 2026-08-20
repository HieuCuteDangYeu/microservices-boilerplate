import { of } from 'rxjs';
import { GroupMembersV2Controller } from './group-members-v2.controller';

describe('GroupMembersV2Controller', () => {
  it('uses authenticated identity and enriches role projection with legacy user data', async () => {
    const conversationClient = {
      send: jest.fn().mockImplementation((pattern: string) => {
        if (pattern === 'get_group_member_projection') {
          return of([
            {
              userId: 'member-id',
              role: 'ADMIN',
              status: 'ACTIVE',
              joinedAt: '2026-08-19T00:00:00.000Z',
              invitedBy: 'owner-id',
            },
          ]);
        }

        if (pattern === 'get_conversation_detail') {
          return of({
            participants: [
              {
                id: 'member-id',
                email: 'member@example.test',
                fullName: 'Member Name',
                avatar: 'https://example.test/member.png',
              },
            ],
          });
        }

        throw new Error(`Unexpected RMQ pattern ${pattern}`);
      }),
    };
    const controller = new GroupMembersV2Controller(conversationClient as never);

    await expect(
      controller.getGroupMemberProjection('conversation-id', {
        id: 'authenticated-user-id',
      } as never),
    ).resolves.toEqual([
      {
        userId: 'member-id',
        role: 'ADMIN',
        status: 'ACTIVE',
        joinedAt: '2026-08-19T00:00:00.000Z',
        invitedBy: 'owner-id',
        user: {
          id: 'member-id',
          email: 'member@example.test',
          fullName: 'Member Name',
          picture: 'https://example.test/member.png',
        },
      },
    ]);

    expect(conversationClient.send).toHaveBeenCalledWith(
      'get_group_member_projection',
      {
        conversationId: 'conversation-id',
        requesterUserId: 'authenticated-user-id',
      },
    );
    expect(conversationClient.send).toHaveBeenCalledWith(
      'get_conversation_detail',
      {
        id: 'conversation-id',
        userId: 'authenticated-user-id',
      },
    );
  });
});
