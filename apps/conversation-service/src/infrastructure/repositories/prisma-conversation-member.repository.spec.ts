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

  it('changes a role only after writing the legacy-owner guard in the same transaction', async () => {
    const tx = {
      conversation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      conversationMember: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback: any) => callback(tx)),
    };
    const repository = new PrismaConversationMemberRepository(prisma as never);

    await expect(
      repository.changeRoleAsLegacyOwner(
        'conversation-id',
        'owner-id',
        'member-id',
        'MEMBER',
        'ADMIN',
      ),
    ).resolves.toBe(true);

    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conversation-id',
        isGroup: true,
        creatorId: 'owner-id',
        participantIds: { has: 'member-id' },
      },
      data: { creatorId: 'owner-id' },
    });
    expect(tx.conversationMember.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'conversation-id',
        userId: 'member-id',
        status: 'ACTIVE',
        role: 'MEMBER',
      },
      data: { role: 'ADMIN' },
    });
  });

  it('rejects a stale owner without touching the member projection', async () => {
    const tx = {
      conversation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      conversationMember: {
        updateMany: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback: any) => callback(tx)),
    };
    const repository = new PrismaConversationMemberRepository(prisma as never);

    await expect(
      repository.changeRoleAsLegacyOwner(
        'conversation-id',
        'old-owner-id',
        'member-id',
        'MEMBER',
        'ADMIN',
      ),
    ).resolves.toBe(false);

    expect(tx.conversationMember.updateMany).not.toHaveBeenCalled();
  });

  it('returns false when the expected target role changed before the transactional update', async () => {
    const tx = {
      conversation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      conversationMember: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback: any) => callback(tx)),
    };
    const repository = new PrismaConversationMemberRepository(prisma as never);

    await expect(
      repository.changeRoleAsLegacyOwner(
        'conversation-id',
        'owner-id',
        'member-id',
        'MEMBER',
        'ADMIN',
      ),
    ).resolves.toBe(false);
  });

  it('propagates unexpected transaction failures', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('transaction unavailable')),
    };
    const repository = new PrismaConversationMemberRepository(prisma as never);

    await expect(
      repository.changeRoleAsLegacyOwner(
        'conversation-id',
        'owner-id',
        'member-id',
        'MEMBER',
        'ADMIN',
      ),
    ).rejects.toThrow('transaction unavailable');
  });
});
