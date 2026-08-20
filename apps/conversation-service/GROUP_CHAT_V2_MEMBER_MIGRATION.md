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
pnpm audit:conversation-members-v2
```

Equivalent direct command:

```bash
node scripts/backfill-conversation-members-v2.cjs
```

Audit mode does not mutate data. A non-zero exit code indicates drift or invalid legacy groups.

After reviewing the output, apply with the explicit safety command:

```bash
pnpm backfill:conversation-members-v2:apply
```

Equivalent direct command:

```bash
CONFIRM=BACKFILL_CONVERSATION_MEMBERS_V2 node scripts/backfill-conversation-members-v2.cjs
```

Then run audit mode again and require:

- `missingMembers = 0`
- `mismatchedMembers = 0`
- `orphanActiveMembers = 0`
- `invalidGroups = 0`

The backfill preserves `ADMIN` only when the existing projection record is still `ACTIVE`. A previously `LEFT` or `REMOVED` admin who later appears again in legacy `participantIds` is restored as `MEMBER`; explicit owner promotion is required to regain admin privileges. `creatorId` remains authoritative for who is `OWNER` during this stage.

## Stage 2 — Compatibility dual write

Current group create/add/remove/leave/ownership-transfer operations continue updating the legacy `Conversation` document first.

After a successful legacy mutation, conversation-service synchronizes the `ConversationMember` projection:

- create → creator `OWNER`, others `MEMBER`
- add → target becomes `ACTIVE/MEMBER`, `invitedBy = actor`
- owner removal → target becomes `REMOVED`, `removedBy = actor`
- leave → target becomes `LEFT`, `leftAt = now`
- ownership transfer → new creator becomes `OWNER`; previous owner becomes `MEMBER` unless it has another explicitly preserved active role

Projection synchronization is deliberately non-authoritative in this stage. If it fails, the already-committed V1 mutation still succeeds and drift is repaired by the audit/backfill command.

This behavior prevents a cross-collection projection failure from making the client believe a legacy mutation failed when it actually committed.

## Stage 2.5 — Shadow consistency under real traffic

Before the V2 projection participates in authorization, enable read-only shadow verification:

```bash
GROUP_V2_SHADOW_CONSISTENCY_ENABLED=true
```

The flag is default-OFF. When enabled, successful group lifecycle mutations schedule a non-blocking comparison after:

- group creation;
- add member;
- remove member;
- leave group;
- ownership transfer;
- role promotion/demotion.

The shadow checker compares the legacy source of truth against `ConversationMember` and reports `readyForCutover=false` when it sees any of:

- active legacy participant missing from the projection;
- unexpected active projection row not present in `participantIds`;
- projected OWNER set not exactly equal to `creatorId`;
- joined-at timestamp drift;
- conversation/projection read failure.

Drift is logged with the prefix:

```text
[GroupV2Shadow] membership projection drift
```

Shadow checks are deliberately fire-and-forget and never turn a successful V1 mutation into a failed client request. This is telemetry, not authorization.

Required rollout order:

1. schema + dual write deployed;
2. static backfill audit clean;
3. enable `GROUP_V2_SHADOW_CONSISTENCY_ENABLED=true` in staging;
4. exercise normal and concurrent group lifecycle traffic;
5. require no drift warnings and another clean static audit;
6. only then consider enabling gated role mutation;
7. canonical authorization remains a later gate.

Do not enable canonical V2 authorization just because one static backfill run is clean. Shadow traffic validation exists specifically to catch runtime drift that a one-time migration cannot prove absent.

## Stage 3 — Additive read path

A new internal RMQ request is available:

`get_group_member_projection`

A new additive gateway endpoint is available:

`GET /conversations/:id/members/v2`

It returns the V1-compatible member shape plus role metadata:

```ts
{
  userId: string
  user: {
    id: string
    email: string
    name?: string
    fullName?: string
    picture?: string
  }
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

Do not make `ConversationMember` authoritative for existing V1 authorization until all of these pass:

1. schema deployed everywhere;
2. backfill audit is clean;
3. shadow consistency reports remain clean under real traffic;
4. dual-write drift remains zero under normal traffic;
5. ownership transfer stress tests remain clean;
6. add/remove/leave concurrency tests remain clean;
7. mixed-version Socket.IO rollout remains clean;
8. mobile group lifecycle physical-device tests pass.

Until this gate, existing management operations remain owner-only exactly as V1.

### Proposed V2 permission matrix

The matrix is implemented as a pure policy and unit-tested, but it is not wired into current V1 management operations yet.

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

## Stage 5 — Gated role mutation lifecycle

Owner promotion/demotion is implemented as an **additive, default-OFF capability**.

Internal RMQ:

`update_group_member_role`

Gateway endpoint:

`PATCH /conversations/:id/members/:userId/role`

Body:

```json
{ "role": "ADMIN" }
```

or:

```json
{ "role": "MEMBER" }
```

Activation requires:

```bash
GROUP_V2_ROLE_MUTATIONS_ENABLED=true
```

When the variable is absent or false, the use case rejects role mutations. Deploying the code therefore does not automatically grant or change any role-management capability.

Do not enable this flag before shadow consistency has been enabled and remained clean in staging.

### Atomic stale-owner protection

The role write uses a MongoDB/Prisma transaction. Inside the same transaction it:

1. performs a guarded write on the legacy `Conversation` document requiring:
   - matching conversation id;
   - `isGroup = true`;
   - `creatorId = actorUserId`;
   - target user still present in `participantIds`;
2. changes the active target `ConversationMember` only if its current role equals the expected role;
3. rolls the transaction back when the expected target role no longer matches.

Writing the legacy conversation guard is intentional: it prevents the classic stale-owner read/write-skew where ownership transfers between an authorization pre-read and a role write in another collection.

MongoDB transactions require a replica set. Conversation-service already uses Prisma transactions in message persistence, but role mutation must still be runtime-tested against the actual deployment before the flag is enabled.

### Idempotency

`PATCH` is treated idempotently:

- setting an existing `ADMIN` to `ADMIN` succeeds without another write;
- setting an existing `MEMBER` to `MEMBER` succeeds without another write;
- if a concurrent identical role change wins the guarded transaction first, the losing request re-reads state and succeeds if the desired role is already canonical;
- conflicting ownership/membership/role changes return a conflict instead of overwriting current state.

A successful role change reuses the existing `conversation_updated` realtime lifecycle event so connected clients can invalidate member data without changing the established V1 event protocol.

## Stage 6 — Canonical membership cutover

Only after Stage 0–5 runtime gates are clean:

1. switch membership reads to `ConversationMember(status = ACTIVE)`;
2. switch role/permission resolution for existing group mutations to `ConversationMember`;
3. activate ADMIN permissions one action at a time behind rollout controls;
4. keep legacy fields as compatibility projection for at least one rollout window;
5. compare legacy and V2 membership continuously;
6. only then stop using `memberJoinedAt` JSON for new logic.

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

## Group avatar

Backend metadata already supports `picture` update/removal and the current mobile Group Info renders `conversation.picture`. The missing Phase 1 work is the mobile choose/upload/change/remove UX.

Do not write that UI directly to mobile `main`. Apply it only when there is a safe mobile working branch/ref.

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
pnpm test -- create-conversastion.use-case.spec.ts group-membership-consistency.service.spec.ts get-group-members.use-case.spec.ts manage-group-role.use-case.spec.ts group-permission.policy.spec.ts prisma-conversation-member.repository.spec.ts prisma-conversation-chat.repository.spec.ts manage-group-conversation.use-case.spec.ts group-members.controller.spec.ts group-members-v2.controller.spec.ts chat.gateway.realtime.spec.ts chat.gateway.room-migration.spec.ts
pnpm build:conversation
pnpm build:gateway
```

Then:

1. run `pnpm audit:conversation-members-v2` against a staging copy of production data;
2. apply the backfill only after reviewing audit output;
3. run audit again and require zero drift;
4. enable `GROUP_V2_SHADOW_CONSISTENCY_ENABLED=true` in staging while role mutations remain disabled;
5. exercise create/add/remove/leave/ownership-transfer traffic including concurrency races;
6. require no `[GroupV2Shadow]` drift warnings and another clean static audit;
7. only then enable `GROUP_V2_ROLE_MUTATIONS_ENABLED=true` in staging;
8. exercise promote/demote and race them against ownership transfer/member removal;
9. verify Android/iOS group lifecycle remains unchanged with both flags disabled in production-equivalent configuration.

No merge should happen until runtime/physical-device validation is complete.