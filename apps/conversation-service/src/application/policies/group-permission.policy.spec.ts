import { evaluateGroupPermission } from './group-permission.policy';

describe('evaluateGroupPermission', () => {
  it.each([
    ['OWNER', 'UPDATE_METADATA'],
    ['ADMIN', 'UPDATE_METADATA'],
    ['OWNER', 'ADD_MEMBER'],
    ['ADMIN', 'ADD_MEMBER'],
  ] as const)('allows %s to %s', (actorRole, permission) => {
    expect(evaluateGroupPermission({ actorRole, permission })).toEqual({
      allowed: true,
    });
  });

  it.each(['UPDATE_METADATA', 'ADD_MEMBER'] as const)(
    'blocks MEMBER from %s',
    (permission) => {
      expect(
        evaluateGroupPermission({ actorRole: 'MEMBER', permission }).allowed,
      ).toBe(false);
    },
  );

  it('allows OWNER to remove MEMBER or ADMIN but never OWNER', () => {
    expect(
      evaluateGroupPermission({
        actorRole: 'OWNER',
        permission: 'REMOVE_MEMBER',
        targetRole: 'MEMBER',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateGroupPermission({
        actorRole: 'OWNER',
        permission: 'REMOVE_MEMBER',
        targetRole: 'ADMIN',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateGroupPermission({
        actorRole: 'OWNER',
        permission: 'REMOVE_MEMBER',
        targetRole: 'OWNER',
      }).allowed,
    ).toBe(false);
  });

  it('allows ADMIN to remove MEMBER but not ADMIN or OWNER', () => {
    expect(
      evaluateGroupPermission({
        actorRole: 'ADMIN',
        permission: 'REMOVE_MEMBER',
        targetRole: 'MEMBER',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateGroupPermission({
        actorRole: 'ADMIN',
        permission: 'REMOVE_MEMBER',
        targetRole: 'ADMIN',
      }).allowed,
    ).toBe(false);
    expect(
      evaluateGroupPermission({
        actorRole: 'ADMIN',
        permission: 'REMOVE_MEMBER',
        targetRole: 'OWNER',
      }).allowed,
    ).toBe(false);
  });

  it('reserves promote and demote operations for OWNER', () => {
    expect(
      evaluateGroupPermission({
        actorRole: 'OWNER',
        permission: 'PROMOTE_MEMBER',
        targetRole: 'MEMBER',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateGroupPermission({
        actorRole: 'ADMIN',
        permission: 'PROMOTE_MEMBER',
        targetRole: 'MEMBER',
      }).allowed,
    ).toBe(false);
    expect(
      evaluateGroupPermission({
        actorRole: 'OWNER',
        permission: 'DEMOTE_ADMIN',
        targetRole: 'ADMIN',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateGroupPermission({
        actorRole: 'ADMIN',
        permission: 'DEMOTE_ADMIN',
        targetRole: 'ADMIN',
      }).allowed,
    ).toBe(false);
  });

  it('allows only OWNER to transfer ownership to another active non-owner role', () => {
    expect(
      evaluateGroupPermission({
        actorRole: 'OWNER',
        permission: 'TRANSFER_OWNERSHIP',
        targetRole: 'ADMIN',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateGroupPermission({
        actorRole: 'OWNER',
        permission: 'TRANSFER_OWNERSHIP',
        targetRole: 'MEMBER',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateGroupPermission({
        actorRole: 'ADMIN',
        permission: 'TRANSFER_OWNERSHIP',
        targetRole: 'MEMBER',
      }).allowed,
    ).toBe(false);
  });

  it('requires OWNER to transfer before leaving', () => {
    expect(
      evaluateGroupPermission({
        actorRole: 'OWNER',
        permission: 'LEAVE_GROUP',
      }).allowed,
    ).toBe(false);
    expect(
      evaluateGroupPermission({
        actorRole: 'ADMIN',
        permission: 'LEAVE_GROUP',
      }).allowed,
    ).toBe(true);
    expect(
      evaluateGroupPermission({
        actorRole: 'MEMBER',
        permission: 'LEAVE_GROUP',
      }).allowed,
    ).toBe(true);
  });

  it('keeps disband disabled until the two-member group product policy is chosen', () => {
    expect(
      evaluateGroupPermission({
        actorRole: 'OWNER',
        permission: 'DISBAND_GROUP',
      }).allowed,
    ).toBe(false);
  });
});
