import type { ConversationMemberRole } from '../../domain/interfaces/conversation-member.repository.interface';

export type GroupPermission =
  | 'UPDATE_METADATA'
  | 'ADD_MEMBER'
  | 'REMOVE_MEMBER'
  | 'PROMOTE_MEMBER'
  | 'DEMOTE_ADMIN'
  | 'TRANSFER_OWNERSHIP'
  | 'LEAVE_GROUP'
  | 'DISBAND_GROUP';

export type GroupPermissionContext = {
  actorRole: ConversationMemberRole;
  permission: GroupPermission;
  targetRole?: ConversationMemberRole;
};

export type GroupPermissionDecision = {
  allowed: boolean;
  reason?: string;
};

const denied = (reason: string): GroupPermissionDecision => ({
  allowed: false,
  reason,
});

const allowed = (): GroupPermissionDecision => ({ allowed: true });

/**
 * V2 permission policy definition only.
 *
 * This policy is intentionally not wired into the current V1 mutation use case
 * until ConversationMember has passed the migration/cutover gates. Keeping the
 * decision logic pure lets us test the intended matrix without granting ADMIN
 * privileges from a projection that is not authoritative yet.
 */
export const evaluateGroupPermission = ({
  actorRole,
  permission,
  targetRole,
}: GroupPermissionContext): GroupPermissionDecision => {
  switch (permission) {
    case 'UPDATE_METADATA':
    case 'ADD_MEMBER':
      return actorRole === 'OWNER' || actorRole === 'ADMIN'
        ? allowed()
        : denied('Only the group owner or an admin can perform this action');

    case 'REMOVE_MEMBER':
      if (!targetRole) {
        return denied('Target member role is required');
      }
      if (targetRole === 'OWNER') {
        return denied('The group owner cannot be removed');
      }
      if (actorRole === 'OWNER') {
        return allowed();
      }
      if (actorRole === 'ADMIN' && targetRole === 'MEMBER') {
        return allowed();
      }
      return denied('Admins can only remove regular members');

    case 'PROMOTE_MEMBER':
      if (actorRole !== 'OWNER') {
        return denied('Only the group owner can promote admins');
      }
      return targetRole === 'MEMBER'
        ? allowed()
        : denied('Only a regular member can be promoted');

    case 'DEMOTE_ADMIN':
      if (actorRole !== 'OWNER') {
        return denied('Only the group owner can demote admins');
      }
      return targetRole === 'ADMIN'
        ? allowed()
        : denied('Only an admin can be demoted');

    case 'TRANSFER_OWNERSHIP':
      return actorRole === 'OWNER'
        ? targetRole && targetRole !== 'OWNER'
          ? allowed()
          : denied('Ownership must transfer to another active member')
        : denied('Only the group owner can transfer ownership');

    case 'LEAVE_GROUP':
      return actorRole === 'OWNER'
        ? denied('The group owner must transfer ownership before leaving')
        : allowed();

    case 'DISBAND_GROUP':
      // Product policy is deliberately unresolved for two-member groups. Keep
      // the permission disabled until an explicit disband policy is selected.
      return denied('Group disband policy is not enabled');
  }
};
