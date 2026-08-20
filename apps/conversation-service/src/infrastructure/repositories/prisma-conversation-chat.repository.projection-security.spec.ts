import { PrismaConversationChatRepository } from './prisma-conversation-chat.repository';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const REJOINING_ID = '33333333-3333-4333-8333-333333333333';
const createdAt = new Date('2026-08-19T00:00:00.000Z');
const rejoinedAt = new Date('2026-08-20T00:00:00.000Z');

const joinedAtMap = (ids: string[], timestamp: Date) =>
  Object.fromEntries(ids.map((id) => [id, timestamp.toISOString()]));

describe('PrismaConversationChatRepository V2 projection security', () => {
  it.each(['LEFT', 'REMOVED'] as const)(
    're-adds a formerly %s ADMIN as MEMBER instead of restoring privileges',
    async (previousStatus) => {
      const upsert = jest.fn().mockResolvedValue({});
      const prisma = {
        conversation: {
          findUnique: jest
            .fn()
            .mockResolvedValueOnce({
              creatorId: OWNER_ID,
              participantIds: [OWNER_ID, MEMBER_ID],
              memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID], createdAt),
              createdAt,
            })
            .mockResolvedValueOnce({
              creatorId: OWNER_ID,
              participantIds: [OWNER_ID, MEMBER_ID, REJOINING_ID],
              memberJoinedAt: {
                ...joinedAtMap([OWNER_ID, MEMBER_ID], createdAt),
                [REJOINING_ID]: rejoinedAt.toISOString(),
              },
              createdAt,
              isGroup: true,
            }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        conversationMember: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'owner-row',
              userId: OWNER_ID,
              role: 'OWNER',
              status: 'ACTIVE',
              invitedBy: null,
            },
            {
              id: 'member-row',
              userId: MEMBER_ID,
              role: 'MEMBER',
              status: 'ACTIVE',
              invitedBy: OWNER_ID,
            },
            {
              id: 'rejoining-row',
              userId: REJOINING_ID,
              role: 'ADMIN',
              status: previousStatus,
              invitedBy: OWNER_ID,
            },
          ]),
          upsert,
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const repository = new PrismaConversationChatRepository(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(
        repository.addParticipantAsOwner(
          'conversation-id',
          OWNER_ID,
          REJOINING_ID,
          rejoinedAt,
        ),
      ).resolves.toBe(true);

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversationId_userId: {
              conversationId: 'conversation-id',
              userId: REJOINING_ID,
            },
          },
          update: expect.objectContaining({
            role: 'MEMBER',
            status: 'ACTIVE',
            joinedAt: rejoinedAt,
            invitedBy: OWNER_ID,
          }),
        }),
      );
    },
  );
});
