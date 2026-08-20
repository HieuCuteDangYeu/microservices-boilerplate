# Group Chat V2 — ConversationMember Migration Plan

## Goal

Introduce a real per-member model for Group Chat V2 without breaking the current mobile application, direct chats, realtime event names, ownership transfer, or existing group history.

This plan deliberately separates **data migration** from **behavior cutover**.

## Current V1 source of truth

During the first rollout stages the existing `Conversation` fields remain authoritative:

- `creatorId`
- `participantIds`
- `memberJoinedAt`

Existing REST/RMQ/realtime contracts continue to use those fields.

The new `ConversationMember` collection is initially a projection, not the authorization source of truth.

## New V2 model

Each group participant has at most one row per conversation:

- `conversationId`
- `userId`
- `role`: `OWNER | ADMIN | MEMBER`
- `status`: `ACTIVE | LEFT | REMOVED`
- `joinedAt`
- `invitedBy`
- `leftAt`
- `removedBy`

The compound unique constraint `(conversationId, userId)` prevents duplicate membership rows.

Direct conversations are intentionally not backfilled in this phase. The V2 model is introduced for group membership first.

## Stage 0 — Schema deploy only

1. Generate the conversation Prisma client with the new model.
2. Run the normal conversation schema deployment (`prisma db push` in this repository).
3. Do not change mobile/API behavior yet.
4. Confirm the new collection/indexes exist.

Rollback: application code can continue to use the legacy fields because they are untouched.

## Stage 1 — Audit and backfill

Run the backfill in audit mode first:

```bash
node scripts/backfill-conversation-members-v2.cjs
```

Audit mode does not mutate data. A non-zero exit code indicates drift or invalid legacy groups.

After reviewing the output, apply with the explicit safety token:

```bash
CONFIRM=BACKFILL_CONVERSATION_MEMBERS_V2 node scripts/backfill-conversation-members-v2.cjs
```

Then run audit mode again and require:

- `missingMembers = 0`
- `mismatchedMembers = 0`
- `orphanActiveMembers = 0`
- `invalidGroups = 0`

The backfill preserves an existing `ADMIN` role for a non-owner record, but `creatorId` remains authoritative for who is `OWNER` during this stage.

## Stage 2 — Compatibility dual write

Current group create/add/remove/leave/ownership-transfer operations continue updating the legacy `Conversation` document first.

After a successful legacy mutation, conversation-service synchronizes the `ConversationMember` projection:

- create → creator `OWNER`, others `MEMBER`
- add → target becomes `ACTIVE/MEMBER`, `invitedBy = actor`
- owner removal → target becomes `REMOVED`, `removedBy = actor`
- leave → target becomes `LEFT`, `leftAt = now`
- ownership transfer → new creator becomes `OWNER`; previous owner becomes `MEMBER` unless it has another explicitly preserved role

Projection synchronization is deliberately non-authoritative in this stage. If it fails, the already-committed V1 mutation still succeeds and drift is repaired by the audit/backfill command.

This behavior prevents a cross-collection projection failure from making the client believe a legacy mutation failed when it actually committed.

## Stage 3 — Additive read path

A new internal RMQ request is available:

`get_group_member_projection`

A new additive gateway endpoint is available:

`GET /conversations/:id/members/v2`

It returns:

```ts
{
  userId: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  status: 'ACTIVE'
  joinedAt: string
  invitedBy?: string | null
}
```

The current `GET /conversations/:id/members` endpoint is unchanged.

During this stage:

- legacy `creatorId` always wins for `OWNER`;
- a projected `ADMIN` role is used only when the matching legacy participant is still active;
- missing/unavailable projection data falls back to `MEMBER`;
- inactive projection rows are not allowed to create active membership that is absent from `participantIds`.

This makes the V2 read path fail closed instead of granting stale privileges.

## Stage 4 — Permission matrix preparation

Do not make `ConversationMember` authoritative for authorization until all of these pass:

1. schema deployed everywhere;
2. backfill audit is clean;
3. dual-write drift remains zero under normal traffic;
4. ownership transfer stress tests remain clean;
5. add/remove/leave concurrency tests remain clean;
6. mixed-version Socket.IO rollout remains clean;
7. mobile group lifecycle physical-device tests pass.

Until this gate, existing management operations remain owner-only exactly as V1.

### Proposed V2 permission matrix

This matrix is a proposal to be activated after the cutover gate, not an active behavior change in Stage 1–3.

| Action | OWNER | ADMIN | MEMBER |
| --- | --- | --- | --- |
| Rename/change group picture | Yes | Yes | No |
| Add member | Yes | Yes | No |
| Remove MEMBER | Yes | Yes | No |
| Remove ADMIN | Yes | No | No |
| Promote MEMBER → ADMIN | Yes | No | No |
| Demote ADMIN → MEMBER | Yes | No | No |
| Transfer ownership | Yes | No | No |
| Leave group | Transfer first | Yes | Yes |
| Disband group | Policy gate | No | No |

Any ADMIN action that depends on target role must fail closed if the target role projection cannot be verified.

## Stage 5 — Role mutation cutover

Role promotion/demotion must not be enabled with a stale-owner read-then-write pattern.

Before role mutations are exposed, choose and validate one atomic strategy:

1. MongoDB transaction covering ownership verification and member-role update, or
2. make `ConversationMember` the canonical ownership source first so the authorization condition and role update can occur in one canonical membership write path.

Do not implement owner promotion/demotion using a pre-read `creatorId` check followed by an unguarded write to another collection.

## Stage 6 — Canonical membership cutover

After runtime validation:

1. switch membership reads to `ConversationMember(status = ACTIVE)`;
2. switch role/permission resolution to `ConversationMember`;
3. keep legacy fields as compatibility projection for at least one rollout window;
4. compare legacy and V2 membership continuously;
5. only then stop using `memberJoinedAt` JSON for new logic.

Removing `participantIds`, `creatorId`, or `memberJoinedAt` is a later migration and must not be bundled into the first V2 rollout.

## Product policy gates still intentionally unchanged

### Two-member groups

Current creation behavior is preserved by this migration. The migration itself does not silently change minimum group size or auto-convert groups to direct chats.

Before a disband feature or stricter creation rule is enabled, product must choose between:

- require creator + at least two other users for new groups; or
- keep two-member groups and provide an explicit disband flow.

Existing two-member groups must be included in that decision.

### New-member history

Phase 1 preserves the current **FULL HISTORY** behavior for compatibility: a newly added active member can read existing group history.

Changing to join-boundary history is a separate privacy migration that must update pagination, around-message, anchor older/newer, search, pinned navigation, local bootstrap and reply-target behavior together.

## System activity messages

Do not emit system activity messages until member/role mutations are authoritative enough to guarantee exactly-once semantics. Otherwise a projection retry could create duplicate activity entries.

When implemented, activity types should be structured metadata rather than localized text persisted as the source of truth, for example:

- `GROUP_CREATED`
- `MEMBER_ADDED`
- `MEMBER_LEFT`
- `MEMBER_REMOVED`
- `MEMBER_PROMOTED`
- `MEMBER_DEMOTED`
- `OWNERSHIP_TRANSFERRED`
- `GROUP_RENAMED`
- `GROUP_PICTURE_CHANGED`

Rendering text belongs at the client/presentation layer.

## Required validation before merge

At minimum:

```bash
pnpm prisma:generate:conversation
pnpm exec prisma validate --schema=apps/conversation-service/prisma/schema.prisma
pnpm test -- get-group-members.use-case.spec.ts prisma-conversation-chat.repository.spec.ts manage-group-conversation.use-case.spec.ts chat.gateway.realtime.spec.ts chat.gateway.room-migration.spec.ts
pnpm build:conversation
pnpm build:gateway
```

Then run the backfill against a staging copy of production data in audit mode before any apply run.

No merge should happen until runtime/physical-device validation is complete.
