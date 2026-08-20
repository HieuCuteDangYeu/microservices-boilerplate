import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Conversation } from '../../domain/entities/conversation.entity';
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import type { IConversationMemberRepository } from '../../domain/interfaces/conversation-member.repository.interface';
import { GetGroupMembersUseCase } from './get-group-members.use-case';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const OUTSIDER_ID = '44444444-4444-4444-8444-444444444444';
const createdAt = new Date('2026-08-19T00:00:00.000Z');

const group = () =>
  new Conversation({
    id: 'group-id',
    creatorId: OWNER_ID,
    participantIds: [OWNER_ID, MEMBER_ID, ADMIN_ID],
    memberJoinedAt: {
      [OWNER_ID]: createdAt.toISOString(),
      [MEMBER_ID]: new Date('2026-08-19T01:00:00.000Z').toISOString(),
      [ADMIN_ID]: new Date('2026-08-19T02:00:00.000Z').toISOString(),
    },
    isGroup: true,
    createdAt,
    updatedAt: createdAt,
  });

const canonicalProjection = () => [
  {
    id: 'owner-row',
    conversationId: 'group-id',
    userId: OWNER_ID,
    role: 'OWNER' as const,
    status: 'ACTIVE' as const,
    joinedAt: createdAt,
  },
  {
    id: 'member-row',
    conversationId: 'group-id',
    userId: MEMBER_ID,
    role: 'MEMBER' as const,
    status: 'ACTIVE' as const,
    joinedAt: new Date('2026-08-19T01:00:00.000Z'),
  },
  {
    id: 'admin-row',
    conversationId: 'group-id',
    userId: ADMIN_ID,
    role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
    joinedAt: new Date('2026-08-19T02:00:00.000Z'),
    invitedBy: OWNER_ID,
  },
];

describe('GetGroupMembersUseCase', () => {
  let chatRepository: { findConversation: jest.Mock };
  let memberRepository: { listByConversation: jest.Mock };
  let configService: { get: jest.Mock };
  let useCase: GetGroupMembersUseCase;

  beforeEach(() => {
    chatRepository = { findConversation: jest.fn().mockResolvedValue(group()) };
    memberRepository = { listByConversation: jest.fn().mockResolvedValue([]) };
    configService = { get: jest.fn().mockReturnValue('false') };
    useCase = new GetGroupMembersUseCase(
      chatRepository as unknown as IChatRepository,
      memberRepository as unknown as IConversationMemberRepository,
      configService as never,
    );
  });

  it('returns legacy-compatible active members with additive roles while canonical reads are disabled', async () => {
    memberRepository.listByConversation.mockResolvedValue([
      {
        id: 'owner-row',
        conversationId: 'group-id',
        userId: OWNER_ID,
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: createdAt,
      },
      {
        id: 'admin-row',
        conversationId: 'group-id',
        userId: ADMIN_ID,
        role: 'ADMIN',
        status: 'ACTIVE',
        joinedAt: new Date('2026-08-19T02:00:00.000Z'),
        invitedBy: OWNER_ID,
      },
    ]);

    const result = await useCase.execute('group-id', MEMBER_ID);

    expect(result).toEqual([
      expect.objectContaining({
        userId: OWNER_ID,
        role: 'OWNER',
        status: 'ACTIVE',
      }),
      expect.objectContaining({
        userId: MEMBER_ID,
        role: 'MEMBER',
        status: 'ACTIVE',
      }),
      expect.objectContaining({
        userId: ADMIN_ID,
        role: 'ADMIN',
        status: 'ACTIVE',
        invitedBy: OWNER_ID,
      }),
    ]);
  });

  it('keeps legacy creatorId authoritative over a stale projected owner while canonical reads are disabled', async () => {
    memberRepository.listByConversation.mockResolvedValue([
      {
        id: 'stale-owner-row',
        conversationId: 'group-id',
        userId: MEMBER_ID,
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: createdAt,
      },
    ]);

    const result = await useCase.execute('group-id', OWNER_ID);

    expect(result.find((member) => member.userId === OWNER_ID)?.role).toBe(
      'OWNER',
    );
    expect(result.find((member) => member.userId === MEMBER_ID)?.role).toBe(
      'MEMBER',
    );
  });

  it('falls back to legacy membership if the V2 projection is unavailable while canonical reads are disabled', async () => {
    memberRepository.listByConversation.mockRejectedValue(
      new Error('projection unavailable'),
    );

    const result = await useCase.execute('group-id', OWNER_ID);

    expect(result).toHaveLength(3);
    expect(result.map((member) => member.role)).toEqual([
      'OWNER',
      'MEMBER',
      'MEMBER',
    ]);
  });

  it('reads membership and joined-at directly from ConversationMember when the canonical-read flag is enabled', async () => {
    configService.get.mockReturnValue('true');
    memberRepository.listByConversation.mockResolvedValue(canonicalProjection());

    const result = await useCase.execute('group-id', MEMBER_ID);

    expect(result).toEqual([
      {
        userId: OWNER_ID,
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: createdAt.toISOString(),
      },
      {
        userId: MEMBER_ID,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: '2026-08-19T01:00:00.000Z',
      },
      {
        userId: ADMIN_ID,
        role: 'ADMIN',
        status: 'ACTIVE',
        joinedAt: '2026-08-19T02:00:00.000Z',
        invitedBy: OWNER_ID,
      },
    ]);
  });

  it('fails closed when canonical projection membership diverges from the legacy rollout guard', async () => {
    configService.get.mockReturnValue('true');
    memberRepository.listByConversation.mockResolvedValue(
      canonicalProjection().filter((member) => member.userId !== MEMBER_ID),
    );

    await expect(useCase.execute('group-id', OWNER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('fails closed when canonical projection owner does not match the legacy rollout guard', async () => {
    configService.get.mockReturnValue('true');
    memberRepository.listByConversation.mockResolvedValue(
      canonicalProjection().map((member) =>
        member.userId === OWNER_ID
          ? { ...member, role: 'MEMBER' as const }
          : member.userId === MEMBER_ID
            ? { ...member, role: 'OWNER' as const }
            : member,
      ),
    );

    await expect(useCase.execute('group-id', OWNER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not fall back to legacy data if canonical projection reads are enabled but unavailable', async () => {
    configService.get.mockReturnValue('true');
    memberRepository.listByConversation.mockRejectedValue(
      new Error('projection unavailable'),
    );

    await expect(useCase.execute('group-id', OWNER_ID)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('blocks a non-member from reading group membership roles in legacy mode', async () => {
    await expect(useCase.execute('group-id', OUTSIDER_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(memberRepository.listByConversation).not.toHaveBeenCalled();
  });

  it('blocks a requester that is not active in the canonical projection', async () => {
    configService.get.mockReturnValue('true');
    memberRepository.listByConversation.mockResolvedValue(canonicalProjection());

    await expect(
      useCase.execute('group-id', OUTSIDER_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose role projection for direct conversations', async () => {
    chatRepository.findConversation.mockResolvedValue(
      new Conversation({
        ...group(),
        isGroup: false,
        participantIds: [OWNER_ID, MEMBER_ID],
      }),
    );

    await expect(useCase.execute('group-id', OWNER_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(memberRepository.listByConversation).not.toHaveBeenCalled();
  });
});