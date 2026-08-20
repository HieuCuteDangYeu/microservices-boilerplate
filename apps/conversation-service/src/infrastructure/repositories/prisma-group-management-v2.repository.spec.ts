import { PrismaGroupManagementV2Repository } from './prisma-group-management-v2.repository';

const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const OWNER_ID = 'owner-id';
const ADMIN_ID = 'admin-id';
const MEMBER_ID = 'member-id';
const NEW_MEMBER_ID = 'new-member-id';
const CREATED_AT = new Date('2026-08-20T00:00:00.000Z');
const MEMBER_UPDATED_AT = new Date('2026-08-20T01:00:00.000Z');

const conversationSnapshot = (overrides: Record<string, unknown> = {}) => ({
  id: CONVERSATION_ID,
  creatorId: OWNER_ID,
  participantIds: [OWNER_ID, ADMIN_ID, MEMBER_ID],
  memberJoinedAt: {
    [OWNER_ID]: CREATED_AT.toISOString(),
    [ADMIN_ID]: CREATED_AT.toISOString(),
    [MEMBER_ID]: CREATED_AT.toISOString(),
  },
  createdAt: CREATED_AT,
  isGroup: true,
  ...overrides,
});

const activeMember = (userId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER') => ({
  id: `row-${userId}`,
  userId,
  role,
  status: 'ACTIVE',
  updatedAt: MEMBER_UPDATED_AT,
});

const createTx = () => ({
  conversation: {
    findUnique: jest.fn().mockResolvedValue(conversationSnapshot()),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  conversationMember: {
    findUnique: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    update: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
  },
});

const createRepository = (tx: ReturnType<typeof createTx>) => {
  const prisma = {
    $transaction: jest.fn().mockImplementation(async (callback: any) => callback(tx)),
  };

  return {
    prisma,
    repository: new PrismaGroupManagementV2Repository(prisma as never),
  };
};

describe('PrismaGroupManagementV2Repository', () => {
  it('updates metadata only while the expected active actor role is unchanged', async () => {
    const tx = createTx();
    tx.conversationMember.findUnique.mockResolvedValue(activeMember(ADMIN_ID, 'ADMIN'));
    const { repository } = createRepository(tx);

    await expect(
      repository.updateMetadataWithRoleGuard(
        CONVERSATION_ID,
        ADMIN_ID,
        'ADMIN',
        { name: 'Renamed' },
      ),
    ).resolves.toBe(true);

    expect(tx.conversationMember.updateMany).toHaveBeenCalledWith({
      where: {
        id: `row-${ADMIN_ID}`,
        status: 'ACTIVE',
        role: 'ADMIN',
        updatedAt: MEMBER_UPDATED_AT,
      },
      data: { updatedAt: new Date('2026-08-20T01:00:00.001Z') },
    });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONVERSATION_ID,
        isGroup: true,
        participantIds: { has: ADMIN_ID },
      },
      data: { name: 'Renamed' },
    });
    expect(tx.conversationMember.update).toHaveBeenCalledWith({
      where: { id: `row-${ADMIN_ID}` },
      data: { updatedAt: MEMBER_UPDATED_AT },
    });
  });

  it('rejects a metadata write when the actor was demoted before the guard is acquired', async () => {
    const tx = createTx();
    tx.conversationMember.findUnique.mockResolvedValue(activeMember(ADMIN_ID, 'MEMBER'));
    const { repository } = createRepository(tx);

    await expect(
      repository.updateMetadataWithRoleGuard(
        CONVERSATION_ID,
        ADMIN_ID,
        'ADMIN',
        { name: 'Stale admin rename' },
      ),
    ).resolves.toBe(false);

    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a metadata write when the actor role changes during the timestamp CAS guard', async () => {
    const tx = createTx();
    tx.conversationMember.findUnique.mockResolvedValue(activeMember(ADMIN_ID, 'ADMIN'));
    tx.conversationMember.updateMany.mockResolvedValueOnce({ count: 0 });
    const { repository } = createRepository(tx);

    await expect(
      repository.updateMetadataWithRoleGuard(
        CONVERSATION_ID,
        ADMIN_ID,
        'ADMIN',
        { name: 'Racing admin rename' },
      ),
    ).resolves.toBe(false);

    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
    expect(tx.conversationMember.update).not.toHaveBeenCalled();
  });

  it('adds a member by atomically updating the legacy projection and ConversationMember row', async () => {
    const tx = createTx();
    tx.conversationMember.findUnique.mockResolvedValue(activeMember(ADMIN_ID, 'ADMIN'));
    const { repository } = createRepository(tx);
    const joinedAt = new Date('2026-08-20T02:00:00.000Z');

    await expect(
      repository.addParticipantWithRoleGuard(
        CONVERSATION_ID,
        ADMIN_ID,
        'ADMIN',
        NEW_MEMBER_ID,
        joinedAt,
      ),
    ).resolves.toBe(true);

    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONVERSATION_ID,
        isGroup: true,
        participantIds: { equals: [OWNER_ID, ADMIN_ID, MEMBER_ID] },
      },
      data: {
        participantIds: { set: [OWNER_ID, ADMIN_ID, MEMBER_ID, NEW_MEMBER_ID] },
        memberJoinedAt: {
          [OWNER_ID]: CREATED_AT.toISOString(),
          [ADMIN_ID]: CREATED_AT.toISOString(),
          [MEMBER_ID]: CREATED_AT.toISOString(),
          [NEW_MEMBER_ID]: joinedAt.toISOString(),
        },
      },
    });
    expect(tx.conversationMember.upsert).toHaveBeenCalledWith({
      where: {
        conversationId_userId: {
          conversationId: CONVERSATION_ID,
          userId: NEW_MEMBER_ID,
        },
      },
      create: {
        conversationId: CONVERSATION_ID,
        userId: NEW_MEMBER_ID,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt,
        invitedBy: ADMIN_ID,
      },
      update: {
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt,
        invitedBy: ADMIN_ID,
        leftAt: null,
        removedBy: null,
      },
    });
  });

  it('rejects removal when the target was promoted before the expected-role write', async () => {
    const tx = createTx();
    tx.conversationMember.findUnique.mockResolvedValue(activeMember(ADMIN_ID, 'ADMIN'));
    tx.conversationMember.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { repository } = createRepository(tx);

    await expect(
      repository.removeParticipantWithRoleGuard(
        CONVERSATION_ID,
        ADMIN_ID,
        'ADMIN',
        MEMBER_ID,
        'MEMBER',
        new Date('2026-08-20T03:00:00.000Z'),
      ),
    ).resolves.toBe(false);

    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('removes a member from both projections while preserving the actor role guard', async () => {
    const tx = createTx();
    tx.conversationMember.findUnique.mockResolvedValue(activeMember(ADMIN_ID, 'ADMIN'));
    tx.conversationMember.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const { repository } = createRepository(tx);

    await expect(
      repository.removeParticipantWithRoleGuard(
        CONVERSATION_ID,
        ADMIN_ID,
        'ADMIN',
        MEMBER_ID,
        'MEMBER',
        new Date('2026-08-20T03:00:00.000Z'),
      ),
    ).resolves.toBe(true);

    expect(tx.conversationMember.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        conversationId: CONVERSATION_ID,
        userId: MEMBER_ID,
        status: 'ACTIVE',
        role: 'MEMBER',
      },
      data: {
        role: 'MEMBER',
        status: 'REMOVED',
        leftAt: null,
        removedBy: ADMIN_ID,
      },
    });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONVERSATION_ID,
        isGroup: true,
        participantIds: { equals: [OWNER_ID, ADMIN_ID, MEMBER_ID] },
      },
      data: {
        participantIds: { set: [OWNER_ID, ADMIN_ID] },
        memberJoinedAt: {
          [OWNER_ID]: CREATED_AT.toISOString(),
          [ADMIN_ID]: CREATED_AT.toISOString(),
        },
      },
    });
  });

  it('refuses to remove anyone when the group already has only two participants', async () => {
    const tx = createTx();
    tx.conversation.findUnique.mockResolvedValue(
      conversationSnapshot({ participantIds: [OWNER_ID, MEMBER_ID] }),
    );
    const { repository } = createRepository(tx);

    await expect(
      repository.removeParticipantWithRoleGuard(
        CONVERSATION_ID,
        OWNER_ID,
        'OWNER',
        MEMBER_ID,
        'MEMBER',
        new Date(),
      ),
    ).resolves.toBe(false);

    expect(tx.conversationMember.findUnique).not.toHaveBeenCalled();
    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('lets an admin leave only while they are still an active admin and not the owner', async () => {
    const tx = createTx();
    tx.conversationMember.updateMany.mockResolvedValueOnce({ count: 1 });
    const { repository } = createRepository(tx);
    const leftAt = new Date('2026-08-20T04:00:00.000Z');

    await expect(
      repository.leaveParticipantWithRoleGuard(
        CONVERSATION_ID,
        ADMIN_ID,
        'ADMIN',
        leftAt,
      ),
    ).resolves.toBe(true);

    expect(tx.conversationMember.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: CONVERSATION_ID,
        userId: ADMIN_ID,
        status: 'ACTIVE',
        role: 'ADMIN',
      },
      data: {
        role: 'MEMBER',
        status: 'LEFT',
        leftAt,
        removedBy: null,
      },
    });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONVERSATION_ID,
        isGroup: true,
        creatorId: { not: ADMIN_ID },
        participantIds: { equals: [OWNER_ID, ADMIN_ID, MEMBER_ID] },
      },
      data: {
        participantIds: { set: [OWNER_ID, MEMBER_ID] },
        memberJoinedAt: {
          [OWNER_ID]: CREATED_AT.toISOString(),
          [MEMBER_ID]: CREATED_AT.toISOString(),
        },
      },
    });
  });

  it('transfers ownership only if both owner and target roles still match inside the transaction', async () => {
    const tx = createTx();
    tx.conversationMember.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const { repository } = createRepository(tx);

    await expect(
      repository.transferOwnershipWithRoleGuard(
        CONVERSATION_ID,
        OWNER_ID,
        ADMIN_ID,
        'ADMIN',
      ),
    ).resolves.toBe(true);

    expect(tx.conversationMember.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        conversationId: CONVERSATION_ID,
        userId: OWNER_ID,
        status: 'ACTIVE',
        role: 'OWNER',
      },
      data: { role: 'MEMBER' },
    });
    expect(tx.conversationMember.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        conversationId: CONVERSATION_ID,
        userId: ADMIN_ID,
        status: 'ACTIVE',
        role: 'ADMIN',
      },
      data: { role: 'OWNER' },
    });
    expect(tx.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: CONVERSATION_ID,
        isGroup: true,
        creatorId: OWNER_ID,
        participantIds: { equals: [OWNER_ID, ADMIN_ID, MEMBER_ID] },
      },
      data: { creatorId: ADMIN_ID },
    });
  });

  it('rolls back the ownership transfer when the target role no longer matches', async () => {
    const tx = createTx();
    tx.conversationMember.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { repository } = createRepository(tx);

    await expect(
      repository.transferOwnershipWithRoleGuard(
        CONVERSATION_ID,
        OWNER_ID,
        ADMIN_ID,
        'ADMIN',
      ),
    ).resolves.toBe(false);

    expect(tx.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('propagates unexpected transaction failures instead of masking them as conflicts', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('transaction unavailable')),
    };
    const repository = new PrismaGroupManagementV2Repository(prisma as never);

    await expect(
      repository.updateMetadataWithRoleGuard(
        CONVERSATION_ID,
        ADMIN_ID,
        'ADMIN',
        { name: 'Renamed' },
      ),
    ).rejects.toThrow('transaction unavailable');
  });
});
