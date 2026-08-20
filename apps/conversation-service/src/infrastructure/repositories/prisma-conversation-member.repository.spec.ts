import { PrismaConversationMemberRepository } from './prisma-conversation-member.repository';

describe('PrismaConversationMemberRepository', () => {
  it('lists member projection in deterministic joined order', async () => {
    const joinedAt = new Date('2026-08-19T00:00:00.000Z');
    const prisma = {
      conversationMember: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'member-row',
            conversationId: 'conversation-id',
            userId: 'user-id',
            role: 'ADMIN',
            status: 'ACTIVE',
            joinedAt,
            invitedBy: 'owner-id',
            leftAt: null,
            removedBy: null,
          },
        ]),
      },
    };
    const repository = new PrismaConversationMemberRepository(prisma as never);

    await expect(
      repository.listByConversation('conversation-id'),
    ).resolves.toEqual([
      {
        id: 'member-row',
        conversationId: 'conversation-id',
        userId: 'user-id',
        role: 'ADMIN',
        status: 'ACTIVE',
        joinedAt,
        invitedBy: 'owner-id',
        leftAt: null,
        removedBy: null,
      },
    ]);

    expect(prisma.conversationMember.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'conversation-id' },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    });
  });
});
