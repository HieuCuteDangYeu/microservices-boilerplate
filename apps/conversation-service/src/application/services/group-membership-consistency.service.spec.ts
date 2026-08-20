import { Conversation } from '../../domain/entities/conversation.entity';
import { GroupMembershipConsistencyService } from './group-membership-consistency.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = '507f1f77bcf86cd799439011';
const CREATED_AT = new Date('2026-08-20T00:00:00.000Z');

const group = () =>
  new Conversation({
    id: CONVERSATION_ID,
    creatorId: OWNER_ID,
    participantIds: [OWNER_ID, MEMBER_ID],
    memberJoinedAt: {
      [OWNER_ID]: CREATED_AT.toISOString(),
      [MEMBER_ID]: CREATED_AT.toISOString(),
    },
    isGroup: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

const projection = () => [
  {
    id: 'owner-row',
    conversationId: CONVERSATION_ID,
    userId: OWNER_ID,
    role: 'OWNER' as const,
    status: 'ACTIVE' as const,
    joinedAt: CREATED_AT,
    invitedBy: null,
    leftAt: null,
    removedBy: null,
  },
  {
    id: 'member-row',
    conversationId: CONVERSATION_ID,
    userId: MEMBER_ID,
    role: 'MEMBER' as const,
    status: 'ACTIVE' as const,
    joinedAt: CREATED_AT,
    invitedBy: OWNER_ID,
    leftAt: null,
    removedBy: null,
  },
];

describe('GroupMembershipConsistencyService', () => {
  let chatRepository: any;
  let memberRepository: any;
  let configService: any;
  let service: GroupMembershipConsistencyService;

  beforeEach(() => {
    chatRepository = {
      findConversation: jest.fn().mockResolvedValue(group()),
    };
    memberRepository = {
      listByConversation: jest.fn().mockResolvedValue(projection()),
    };
    configService = {
      get: jest.fn().mockReturnValue('true'),
    };

    service = new GroupMembershipConsistencyService(
      chatRepository,
      memberRepository,
      configService,
    );
  });

  it('does nothing when the shadow consistency flag is disabled', async () => {
    configService.get.mockReturnValue('false');

    await expect(
      service.checkAfterMutation(CONVERSATION_ID, 'add-member'),
    ).resolves.toBeNull();

    expect(chatRepository.findConversation).not.toHaveBeenCalled();
    expect(memberRepository.listByConversation).not.toHaveBeenCalled();
  });

  it('marks a fully converged projection ready for cutover', async () => {
    await expect(
      service.checkAfterMutation(CONVERSATION_ID, 'transfer-ownership'),
    ).resolves.toEqual({
      conversationId: CONVERSATION_ID,
      trigger: 'transfer-ownership',
      readyForCutover: true,
      issues: [],
    });
  });

  it('detects missing, unexpected and owner projection drift', async () => {
    memberRepository.listByConversation.mockResolvedValue([
      {
        ...projection()[1],
        userId: THIRD_ID,
      },
    ]);

    const report = await service.checkAfterMutation(
      CONVERSATION_ID,
      'remove-member',
    );

    expect(report?.readyForCutover).toBe(false);
    expect(report?.issues).toEqual(
      expect.arrayContaining([
        { type: 'MISSING_ACTIVE_MEMBER', userId: OWNER_ID },
        { type: 'MISSING_ACTIVE_MEMBER', userId: MEMBER_ID },
        { type: 'UNEXPECTED_ACTIVE_MEMBER', userId: THIRD_ID },
        {
          type: 'OWNER_MISMATCH',
          expectedOwnerUserId: OWNER_ID,
          projectedOwnerUserIds: [],
        },
      ]),
    );
  });

  it('detects a joined-at mismatch without treating admin as drift', async () => {
    memberRepository.listByConversation.mockResolvedValue([
      projection()[0],
      {
        ...projection()[1],
        role: 'ADMIN',
        joinedAt: new Date('2026-08-20T01:00:00.000Z'),
      },
    ]);

    const report = await service.checkAfterMutation(
      CONVERSATION_ID,
      'role-change',
    );

    expect(report?.issues).toEqual([
      {
        type: 'JOINED_AT_MISMATCH',
        userId: MEMBER_ID,
        expectedJoinedAt: CREATED_AT.toISOString(),
        projectedJoinedAt: '2026-08-20T01:00:00.000Z',
      },
    ]);
  });

  it('fails closed for cutover when the projection cannot be read', async () => {
    memberRepository.listByConversation.mockRejectedValue(
      new Error('projection unavailable'),
    );

    await expect(
      service.checkAfterMutation(CONVERSATION_ID, 'leave-group'),
    ).resolves.toEqual({
      conversationId: CONVERSATION_ID,
      trigger: 'leave-group',
      readyForCutover: false,
      issues: [
        {
          type: 'PROJECTION_UNAVAILABLE',
          detail: 'projection unavailable',
        },
      ],
    });
  });
});
