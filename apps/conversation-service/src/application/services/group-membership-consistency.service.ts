import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Conversation } from '../../domain/entities/conversation.entity';
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import type {
  ConversationMemberRecord,
  IConversationMemberRepository,
} from '../../domain/interfaces/conversation-member.repository.interface';

export type GroupMembershipConsistencyTrigger =
  | 'add-member'
  | 'remove-member'
  | 'leave-group'
  | 'transfer-ownership'
  | 'role-change';

export type GroupMembershipConsistencyIssue =
  | { type: 'CONVERSATION_UNAVAILABLE'; detail: string }
  | { type: 'NOT_A_GROUP' }
  | { type: 'PROJECTION_UNAVAILABLE'; detail: string }
  | { type: 'MISSING_ACTIVE_MEMBER'; userId: string }
  | { type: 'UNEXPECTED_ACTIVE_MEMBER'; userId: string }
  | {
      type: 'OWNER_MISMATCH';
      expectedOwnerUserId: string;
      projectedOwnerUserIds: string[];
    }
  | {
      type: 'JOINED_AT_MISMATCH';
      userId: string;
      expectedJoinedAt: string;
      projectedJoinedAt: string;
    };

export type GroupMembershipConsistencyReport = {
  conversationId: string;
  trigger: GroupMembershipConsistencyTrigger;
  readyForCutover: boolean;
  issues: GroupMembershipConsistencyIssue[];
};

@Injectable()
export class GroupMembershipConsistencyService {
  private readonly logger = new Logger(GroupMembershipConsistencyService.name);

  constructor(
    @Inject('IChatRepository')
    private readonly chatRepository: IChatRepository,
    @Inject('IConversationMemberRepository')
    private readonly memberRepository: IConversationMemberRepository,
    private readonly configService: ConfigService,
  ) {}

  async checkAfterMutation(
    conversationId: string,
    trigger: GroupMembershipConsistencyTrigger,
  ): Promise<GroupMembershipConsistencyReport | null> {
    if (!this.isShadowCheckEnabled()) {
      return null;
    }

    const report = await this.buildReport(conversationId, trigger);

    if (!report.readyForCutover) {
      this.logger.warn(
        `[GroupV2Shadow] membership projection drift ${JSON.stringify(report)}`,
      );
    }

    return report;
  }

  private isShadowCheckEnabled(): boolean {
    const value = this.configService.get<string>(
      'GROUP_V2_SHADOW_CONSISTENCY_ENABLED',
      'false',
    );

    return ['1', 'true', 'yes', 'on'].includes(
      String(value).trim().toLowerCase(),
    );
  }

  private async buildReport(
    conversationId: string,
    trigger: GroupMembershipConsistencyTrigger,
  ): Promise<GroupMembershipConsistencyReport> {
    let conversation: Conversation | null;

    try {
      conversation = await this.chatRepository.findConversation(conversationId);
    } catch (error) {
      return this.report(conversationId, trigger, [
        {
          type: 'CONVERSATION_UNAVAILABLE',
          detail: (error as Error).message,
        },
      ]);
    }

    if (!conversation) {
      return this.report(conversationId, trigger, [
        {
          type: 'CONVERSATION_UNAVAILABLE',
          detail: 'Conversation not found',
        },
      ]);
    }

    if (!conversation.isGroup) {
      return this.report(conversationId, trigger, [{ type: 'NOT_A_GROUP' }]);
    }

    let projectedMembers: ConversationMemberRecord[];

    try {
      projectedMembers =
        await this.memberRepository.listByConversation(conversationId);
    } catch (error) {
      return this.report(conversationId, trigger, [
        {
          type: 'PROJECTION_UNAVAILABLE',
          detail: (error as Error).message,
        },
      ]);
    }

    return this.report(
      conversationId,
      trigger,
      this.compareLegacyAndProjection(conversation, projectedMembers),
    );
  }

  private compareLegacyAndProjection(
    conversation: Conversation,
    projectedMembers: ConversationMemberRecord[],
  ): GroupMembershipConsistencyIssue[] {
    const issues: GroupMembershipConsistencyIssue[] = [];
    const legacyParticipantIds = Array.from(new Set(conversation.participantIds));
    const legacyParticipantSet = new Set(legacyParticipantIds);
    const activeProjectedMembers = projectedMembers.filter(
      (member) => member.status === 'ACTIVE',
    );
    const activeProjectionByUserId = new Map(
      activeProjectedMembers.map((member) => [member.userId, member]),
    );

    for (const userId of legacyParticipantIds) {
      if (!activeProjectionByUserId.has(userId)) {
        issues.push({ type: 'MISSING_ACTIVE_MEMBER', userId });
      }
    }

    for (const member of activeProjectedMembers) {
      if (!legacyParticipantSet.has(member.userId)) {
        issues.push({ type: 'UNEXPECTED_ACTIVE_MEMBER', userId: member.userId });
      }
    }

    const projectedOwnerUserIds = activeProjectedMembers
      .filter((member) => member.role === 'OWNER')
      .map((member) => member.userId)
      .sort();

    if (
      projectedOwnerUserIds.length !== 1 ||
      projectedOwnerUserIds[0] !== conversation.creatorId
    ) {
      issues.push({
        type: 'OWNER_MISMATCH',
        expectedOwnerUserId: conversation.creatorId,
        projectedOwnerUserIds,
      });
    }

    const fallbackJoinedAt = conversation.createdAt.toISOString();

    for (const userId of legacyParticipantIds) {
      const projected = activeProjectionByUserId.get(userId);
      if (!projected) {
        continue;
      }

      const expectedJoinedAt =
        conversation.memberJoinedAt?.[userId] ?? fallbackJoinedAt;
      const projectedJoinedAt = projected.joinedAt.toISOString();

      if (!this.sameInstant(expectedJoinedAt, projectedJoinedAt)) {
        issues.push({
          type: 'JOINED_AT_MISMATCH',
          userId,
          expectedJoinedAt,
          projectedJoinedAt,
        });
      }
    }

    return issues;
  }

  private sameInstant(left: string, right: string): boolean {
    const leftDate = new Date(left);
    const rightDate = new Date(right);

    if (
      Number.isNaN(leftDate.getTime()) ||
      Number.isNaN(rightDate.getTime())
    ) {
      return left === right;
    }

    return leftDate.getTime() === rightDate.getTime();
  }

  private report(
    conversationId: string,
    trigger: GroupMembershipConsistencyTrigger,
    issues: GroupMembershipConsistencyIssue[],
  ): GroupMembershipConsistencyReport {
    return {
      conversationId,
      trigger,
      readyForCutover: issues.length === 0,
      issues,
    };
  }
}
