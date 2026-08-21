import { Conversation } from '../../domain/entities/conversation.entity';
import { PrismaConversationChatRepository } from './prisma-conversation-chat.repository';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';
const NEW_MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const FOURTH_ID = '55555555-5555-4555-8555-555555555555';

const joinedAtMap = (ids: string[], timestamp: Date) =>
  Object.fromEntries(ids.map((id) => [id, timestamp.toISOString()]));

const projectionMember = (
  id: string,
  userId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
  status: 'ACTIVE' | 'LEFT' | 'REMOVED' = 'ACTIVE',
) => ({
  id,
  conversationId: 'conversation-id',
  userId,
  role,
  status,
  joinedAt: new Date('2026-08-19T00:00:00.000Z'),
  invitedBy: null,
  leftAt: null,
  removedBy: null,
});

describe('PrismaConversationChatRepository', () => {
  const createdAt = new Date('2026-08-19T00:00:00.000Z');
  let prisma: any;
  let repository: PrismaConversationChatRepository;

  beforeEach(() => {
    prisma = {
      conversation: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      conversationMember: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    repository = new PrismaConversationChatRepository(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('persists group metadata and joined-at state during creation', async () => {
    const conversation = new Conversation({
      creatorId: OWNER_ID,
      participantIds: [OWNER_ID, MEMBER_ID],
      isGroup: true,
      name: 'Core Team',
      picture: 'https://example.test/group.png',
      memberJoinedAt: {
        [OWNER_ID]: createdAt.toISOString(),
        [MEMBER_ID]: createdAt.toISOString(),
      },
      createdAt,
      updatedAt: createdAt,
    });
    prisma.conversation.create.mockResolvedValue({
      id: 'conversation-id',
      creatorId: OWNER_ID,
      participantIds: [OWNER_ID, MEMBER_ID],
      isGroup: true,
      name: conversation.name,
      picture: conversation.picture,
      memberJoinedAt: conversation.memberJoinedAt,
      lastMessage: null,
      lastMessageAt: null,
      createdAt,
      updatedAt: createdAt,
    });

    const result = await repository.createConversation(conversation);

    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Core Team',
        picture: 'https://example.test/group.png',
        memberJoinedAt: conversation.memberJoinedAt,
      }),
    });
    expect(result.name).toBe('Core Team');
  });

  it('projects a new group into OWNER and MEMBER V2 records', async () => {
    const group = new Conversation({
      creatorId: OWNER_ID,
      participantIds: [OWNER_ID, MEMBER_ID],
      isGroup: true,
      name: 'Core Team',
      memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID], createdAt),
      createdAt,
      updatedAt: createdAt,
    });
    prisma.conversation.create.mockResolvedValue({
      id: 'conversation-id',
      creatorId: OWNER_ID,
      participantIds: [OWNER_ID, MEMBER_ID],
      isGroup: true,
      name: group.name,
      picture: null,
      memberJoinedAt: group.memberJoinedAt,
      lastMessage: null,
      lastMessageAt: null,
      createdAt,
      updatedAt: createdAt,
    });
    prisma.conversation.findUnique.mockResolvedValue({
      creatorId: OWNER_ID,
      participantIds: [OWNER_ID, MEMBER_ID],
      memberJoinedAt: group.memberJoinedAt,
      createdAt,
      isGroup: true,
    });

    await repository.createConversation(group);

    expect(prisma.conversationMember.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.conversationMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId_userId: {
            conversationId: 'conversation-id',
            userId: OWNER_ID,
          },
        },
        create: expect.objectContaining({
          userId: OWNER_ID,
          role: 'OWNER',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(prisma.conversationMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: MEMBER_ID,
          role: 'MEMBER',
          status: 'ACTIVE',
          invitedBy: OWNER_ID,
        }),
      }),
    );
  });

  it('guards metadata updates with the owner at the final database mutation', async () => {
    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.updateMetadataAsOwner('conversation-id', OWNER_ID, {
        name: 'Renamed',
      }),
    ).resolves.toBe(true);

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conversation-id',
        creatorId: OWNER_ID,
        isGroup: true,
      },
      data: { name: 'Renamed' },
    });
  });

  it('rejects a stale old-owner metadata write', async () => {
    prisma.conversation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.updateMetadataAsOwner('conversation-id', OWNER_ID, {
        picture: null,
      }),
    ).resolves.toBe(false);
  });

  it('adds a member with participantIds and memberJoinedAt in one guarded CAS write', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      creatorId: OWNER_ID,
      participantIds: [OWNER_ID, MEMBER_ID],
      memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID], createdAt),
      createdAt,
    });
    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    const joinedAt = new Date('2026-08-19T01:00:00.000Z');

    await expect(
      repository.addParticipantAsOwner(
        'conversation-id',
        OWNER_ID,
        NEW_MEMBER_ID,
        joinedAt,
      ),
    ).resolves.toBe(true);

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conversation-id',
        participantIds: { equals: [OWNER_ID, MEMBER_ID] },
        creatorId: OWNER_ID,
      },
      data: {
        participantIds: { set: [OWNER_ID, MEMBER_ID, NEW_MEMBER_ID] },
        memberJoinedAt: {
          [OWNER_ID]: createdAt.toISOString(),
          [MEMBER_ID]: createdAt.toISOString(),
          [NEW_MEMBER_ID]: joinedAt.toISOString(),
        },
      },
    });
  });

  it('rejects add-member if the actor is no longer the owner', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      creatorId: MEMBER_ID,
      participantIds: [OWNER_ID, MEMBER_ID, THIRD_ID],
      memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID, THIRD_ID], createdAt),
      createdAt,
    });

    await expect(
      repository.addParticipantAsOwner(
        'conversation-id',
        OWNER_ID,
        NEW_MEMBER_ID,
        new Date('2026-08-19T01:00:00.000Z'),
      ),
    ).resolves.toBe(false);

    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('retries a concurrent add without losing the other newly-added member', async () => {
    prisma.conversation.findUnique
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID],
        memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID], createdAt),
        createdAt,
      })
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID, THIRD_ID],
        memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID, THIRD_ID], createdAt),
        createdAt,
      });
    prisma.conversation.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      repository.addParticipantAsOwner(
        'conversation-id',
        OWNER_ID,
        NEW_MEMBER_ID,
        new Date('2026-08-19T01:00:00.000Z'),
      ),
    ).resolves.toBe(true);

    expect(prisma.conversation.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantIds: {
            equals: [OWNER_ID, MEMBER_ID, THIRD_ID],
          },
        }),
        data: expect.objectContaining({
          participantIds: {
            set: [OWNER_ID, MEMBER_ID, THIRD_ID, NEW_MEMBER_ID],
          },
        }),
      }),
    );
  });

  it('retries a concurrent leave without resurrecting the member who already left', async () => {
    prisma.conversation.findUnique
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID, THIRD_ID, FOURTH_ID],
        memberJoinedAt: joinedAtMap(
          [OWNER_ID, MEMBER_ID, THIRD_ID, FOURTH_ID],
          createdAt,
        ),
        createdAt,
      })
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID, FOURTH_ID],
        memberJoinedAt: joinedAtMap(
          [OWNER_ID, MEMBER_ID, FOURTH_ID],
          createdAt,
        ),
        createdAt,
      });
    prisma.conversation.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(
      repository.removeParticipantAsMember('conversation-id', MEMBER_ID),
    ).resolves.toBe(true);

    expect(prisma.conversation.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          participantIds: {
            equals: [OWNER_ID, MEMBER_ID, FOURTH_ID],
          },
        }),
        data: {
          participantIds: { set: [OWNER_ID, FOURTH_ID] },
          memberJoinedAt: {
            [OWNER_ID]: createdAt.toISOString(),
            [FOURTH_ID]: createdAt.toISOString(),
          },
        },
      }),
    );
  });

  it('re-checks the minimum-member invariant after a CAS conflict', async () => {
    prisma.conversation.findUnique
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID, THIRD_ID],
        memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID, THIRD_ID], createdAt),
        createdAt,
      })
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID],
        memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID], createdAt),
        createdAt,
      });
    prisma.conversation.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      repository.removeParticipantAsMember('conversation-id', MEMBER_ID),
    ).resolves.toBe(false);

    expect(prisma.conversation.updateMany).toHaveBeenCalledTimes(1);
  });

  it('removes a participant and its joined-at metadata with a CAS guard', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      creatorId: OWNER_ID,
      participantIds: [OWNER_ID, MEMBER_ID, NEW_MEMBER_ID],
      memberJoinedAt: joinedAtMap(
        [OWNER_ID, MEMBER_ID, NEW_MEMBER_ID],
        createdAt,
      ),
      createdAt,
    });
    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });

    await repository.removeParticipant('conversation-id', MEMBER_ID);

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'conversation-id',
        participantIds: {
          equals: [OWNER_ID, MEMBER_ID, NEW_MEMBER_ID],
        },
      },
      data: {
        participantIds: { set: [OWNER_ID, NEW_MEMBER_ID] },
        memberJoinedAt: {
          [OWNER_ID]: createdAt.toISOString(),
          [NEW_MEMBER_ID]: createdAt.toISOString(),
        },
      },
    });
  });

  it('projects ownership transfer while preserving an existing ADMIN role', async () => {
    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    prisma.conversation.findUnique.mockResolvedValue({
      creatorId: MEMBER_ID,
      participantIds: [OWNER_ID, MEMBER_ID, THIRD_ID],
      memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID, THIRD_ID], createdAt),
      createdAt,
      isGroup: true,
    });
    prisma.conversationMember.findMany.mockResolvedValue([
      projectionMember('owner-row', OWNER_ID, 'OWNER'),
      projectionMember('member-row', MEMBER_ID, 'MEMBER'),
      projectionMember('admin-row', THIRD_ID, 'ADMIN'),
    ]);

    await expect(
      repository.transferOwnership('conversation-id', OWNER_ID, MEMBER_ID),
    ).resolves.toBe(true);

    expect(prisma.conversationMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ role: 'MEMBER', status: 'ACTIVE' }),
        where: {
          conversationId_userId: {
            conversationId: 'conversation-id',
            userId: OWNER_ID,
          },
        },
      }),
    );
    expect(prisma.conversationMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ role: 'OWNER', status: 'ACTIVE' }),
        where: {
          conversationId_userId: {
            conversationId: 'conversation-id',
            userId: MEMBER_ID,
          },
        },
      }),
    );
    expect(prisma.conversationMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ role: 'ADMIN', status: 'ACTIVE' }),
        where: {
          conversationId_userId: {
            conversationId: 'conversation-id',
            userId: THIRD_ID,
          },
        },
      }),
    );
  });

  it('projects a voluntary member leave as LEFT', async () => {
    prisma.conversation.findUnique
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID, THIRD_ID],
        memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID, THIRD_ID], createdAt),
        createdAt,
      })
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, THIRD_ID],
        memberJoinedAt: joinedAtMap([OWNER_ID, THIRD_ID], createdAt),
        createdAt,
        isGroup: true,
      });
    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    prisma.conversationMember.findMany.mockResolvedValue([
      projectionMember('owner-row', OWNER_ID, 'OWNER'),
      projectionMember('member-row', MEMBER_ID, 'MEMBER'),
      projectionMember('third-row', THIRD_ID, 'MEMBER'),
    ]);

    await expect(
      repository.removeParticipantAsMember('conversation-id', MEMBER_ID),
    ).resolves.toBe(true);

    expect(prisma.conversationMember.update).toHaveBeenCalledWith({
      where: { id: 'member-row' },
      data: {
        role: 'MEMBER',
        status: 'LEFT',
        leftAt: expect.any(Date),
        removedBy: null,
      },
    });
  });

  it('projects an owner removal as REMOVED with removedBy', async () => {
    prisma.conversation.findUnique
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID, THIRD_ID],
        memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID, THIRD_ID], createdAt),
        createdAt,
      })
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, THIRD_ID],
        memberJoinedAt: joinedAtMap([OWNER_ID, THIRD_ID], createdAt),
        createdAt,
        isGroup: true,
      });
    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    prisma.conversationMember.findMany.mockResolvedValue([
      projectionMember('owner-row', OWNER_ID, 'OWNER'),
      projectionMember('member-row', MEMBER_ID, 'MEMBER'),
      projectionMember('third-row', THIRD_ID, 'MEMBER'),
    ]);

    await expect(
      repository.removeParticipantAsOwner(
        'conversation-id',
        OWNER_ID,
        MEMBER_ID,
      ),
    ).resolves.toBe(true);

    expect(prisma.conversationMember.update).toHaveBeenCalledWith({
      where: { id: 'member-row' },
      data: {
        role: 'MEMBER',
        status: 'REMOVED',
        leftAt: null,
        removedBy: OWNER_ID,
      },
    });
  });

  it('does not fail an already-committed V1 mutation if projection sync fails', async () => {
    const joinedAt = new Date('2026-08-19T01:00:00.000Z');
    prisma.conversation.findUnique
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID],
        memberJoinedAt: joinedAtMap([OWNER_ID, MEMBER_ID], createdAt),
        createdAt,
      })
      .mockResolvedValueOnce({
        creatorId: OWNER_ID,
        participantIds: [OWNER_ID, MEMBER_ID, NEW_MEMBER_ID],
        memberJoinedAt: {
          ...joinedAtMap([OWNER_ID, MEMBER_ID], createdAt),
          [NEW_MEMBER_ID]: joinedAt.toISOString(),
        },
        createdAt,
        isGroup: true,
      });
    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });
    prisma.conversationMember.findMany.mockRejectedValue(
      new Error('projection unavailable'),
    );

    await expect(
      repository.addParticipantAsOwner(
        'conversation-id',
        OWNER_ID,
        NEW_MEMBER_ID,
        joinedAt,
      ),
    ).resolves.toBe(true);
  });
});
