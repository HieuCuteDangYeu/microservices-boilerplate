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
 * Group Chat V2 permission matrix.
 *
 * Stage 6B wires this policy into group-management mutations only when
 * GROUP_V2_ADMIN_PERMISSIONS_ENABLED is explicitly enabled. With the flag off,
 * the legacy owner-only V1 mutation path remains active. Keeping this policy
 * pure makes the intended OWNER/ADMIN/MEMBER matrix testable independently of
 * rollout state and transactional persistence details.
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
