import { Conversation } from '../../domain/entities/conversation.entity';
import { PrismaConversationChatRepository } from './prisma-conversation-chat.repository';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const NEW_MEMBER_ID = '33333333-3333-4333-8333-333333333333';

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

  it('adds a member without replacing existing joined-at timestamps', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      participantIds: [OWNER_ID, MEMBER_ID],
      memberJoinedAt: {
        [OWNER_ID]: createdAt.toISOString(),
        [MEMBER_ID]: createdAt.toISOString(),
      },
      createdAt,
    });
    prisma.conversation.update.mockResolvedValue({});
    const joinedAt = new Date('2026-08-19T01:00:00.000Z');

    await repository.addParticipant('conversation-id', NEW_MEMBER_ID, joinedAt);

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-id' },
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

  it('removes the participant and its joined-at metadata together', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      participantIds: [OWNER_ID, MEMBER_ID, NEW_MEMBER_ID],
      memberJoinedAt: {
        [OWNER_ID]: createdAt.toISOString(),
        [MEMBER_ID]: createdAt.toISOString(),
        [NEW_MEMBER_ID]: createdAt.toISOString(),
      },
      createdAt,
    });
    prisma.conversation.update.mockResolvedValue({});

    await repository.removeParticipant('conversation-id', MEMBER_ID);

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-id' },
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
