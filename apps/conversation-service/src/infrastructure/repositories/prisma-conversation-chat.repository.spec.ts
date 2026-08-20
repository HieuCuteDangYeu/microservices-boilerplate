import { Conversation } from '../../domain/entities/conversation.entity';
import { PrismaConversationChatRepository } from './prisma-conversation-chat.repository';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';
const NEW_MEMBER_ID = '44444444-4444-4444-8444-444444444444';
const FOURTH_ID = '55555555-5555-4555-8555-555555555555';

const joinedAtMap = (ids: string[], timestamp: Date) =>
  Object.fromEntries(ids.map((id) => [id, timestamp.toISOString()]));

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
        memberJoinedAt: joinedAtMap(
          [OWNER_ID, MEMBER_ID, THIRD_ID],
          createdAt,
        ),
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
        memberJoinedAt: joinedAtMap(
          [OWNER_ID, MEMBER_ID, THIRD_ID],
          createdAt,
        ),
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
});
