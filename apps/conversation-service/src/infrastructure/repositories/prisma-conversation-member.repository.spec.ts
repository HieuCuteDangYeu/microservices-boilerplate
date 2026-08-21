import { PrismaConversationMemberRepository } from './prisma-conversation-member.repository';

const CONVERSATION_UPDATED_AT = new Date('2026-08-20T00:00:00.000Z');

const guardedConversation = () => ({
  creatorId: 'owner-id',
  participantIds: ['owner-id', 'member-id'],
  isGroup: true,
  updatedAt: CONVERSATION_UPDATED_AT,
});

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

  it('changes a role with a legacy-owner write guard and restores conversation.updatedAt before commit', async () => {
    const tx = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue(guardedConversation()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(undefined),
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

    expect(tx.conversation.findUnique).toHaveBeenCalledWith({
      where: { id: 'conversation-id' },
      select: {
        creatorId: true,
        participantIds: true,
        isGroup: true,
        updatedAt: true,
      },
    });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conversation-id',
        isGroup: true,
        creatorId: 'owner-id',
        participantIds: { has: 'member-id' },
        updatedAt: CONVERSATION_UPDATED_AT,
      },
      data: {
        updatedAt: new Date('2026-08-20T00:00:00.001Z'),
      },
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
    expect(tx.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-id' },
      data: { updatedAt: CONVERSATION_UPDATED_AT },
    });
  });

  it('rejects a stale owner before touching the member projection', async () => {
    const tx = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          ...guardedConversation(),
          creatorId: 'new-owner-id',
        }),
        updateMany: jest.fn(),
        update: jest.fn(),
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

    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(tx.conversationMember.updateMany).not.toHaveBeenCalled();
  });

  it('returns false when the guarded conversation changed before the transactional write', async () => {
    const tx = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue(guardedConversation()),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
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
        'owner-id',
        'member-id',
        'MEMBER',
        'ADMIN',
      ),
    ).resolves.toBe(false);

    expect(tx.conversationMember.updateMany).not.toHaveBeenCalled();
    expect(tx.conversation.update).not.toHaveBeenCalled();
  });

  it('returns false when the expected target role changed before the transactional update', async () => {
    const tx = {
      conversation: {
        findUnique: jest.fn().mockResolvedValue(guardedConversation()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
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

    expect(tx.conversation.update).not.toHaveBeenCalled();
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