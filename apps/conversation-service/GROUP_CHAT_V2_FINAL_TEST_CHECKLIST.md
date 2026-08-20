# Group Chat V2 — Final One-Pass Test Checklist

Use this checklist only after schema validation, staging backfill, and a zero-drift audit.

## Staging flags

Enable together for this final V2 test pass:

```bash
GROUP_V2_SHADOW_CONSISTENCY_ENABLED=true
GROUP_V2_CANONICAL_MEMBER_READS_ENABLED=true
GROUP_V2_ROLE_MUTATIONS_ENABLED=true
GROUP_V2_ADMIN_PERMISSIONS_ENABLED=true
GROUP_V2_SYSTEM_ACTIVITIES_ENABLED=true
```

## Test accounts

Prepare at least four normal users:

- **Owner A** — creates the group.
- **Admin B** — starts as MEMBER, then Owner A promotes to ADMIN.
- **Member C** — remains MEMBER.
- **Member D** — initially outside the group and available to add.

Use two physical devices when possible so realtime membership eviction and updates are visible without relogging.

## 1. Create and initial state

1. Owner A creates a group with B and C.
2. Open Group Info as A, B, and C.
3. Verify `/members/v2` shows exactly three ACTIVE members.
4. Verify A = OWNER and B/C = MEMBER.
5. Verify joined times are present and the screen does not return a canonical-read conflict.
6. Verify a centered “created the group” system activity appears once.
7. Verify the conversation sidebar preview shows the readable activity text, not the secure-message placeholder.

Expected: no `[GroupV2Shadow] membership projection drift` warning.

## 2. Owner role management

1. A promotes B to ADMIN.
2. Verify B sees the Admin badge without restarting the app.
3. Verify exactly one promotion activity appears.
4. Repeat the same promote request if convenient; verify no duplicate activity/realtime side effect.
5. A demotes B to MEMBER.
6. Verify one demotion activity.
7. Promote B again for the remaining tests.

Expected permissions:

- A can promote/demote.
- B cannot promote/demote anyone.
- C cannot promote/demote anyone.

## 3. ADMIN metadata permissions

As Admin B:

1. Rename the group.
2. Verify all connected members receive the new name in realtime.
3. Verify one rename activity.
4. Choose a JPEG/PNG/WebP group photo.
5. Verify upload completes and all connected members receive the new photo.
6. Verify one photo-changed activity.
7. Remove the group photo.
8. Verify fallback initial avatar and one photo-removed activity.

As Member C, verify rename/photo controls are not offered and direct API attempts are rejected.

## 4. ADMIN add/remove permissions

1. Admin B adds Member D.
2. Verify D receives/loads the conversation and appears ACTIVE/MEMBER in `/members/v2`.
3. Verify one member-added activity.
4. Verify A/B/C/D all see the updated member count.
5. Admin B removes Member D.
6. Verify D receives `conversation_removed`, is evicted from the room, and cannot send/join afterward.
7. Verify A/B/C see one member-removed activity.

Negative cases:

- B cannot remove Owner A.
- B cannot remove another ADMIN.
- C cannot add/remove members.

## 5. OWNER removal matrix

1. Ensure B is ADMIN and C is MEMBER.
2. A can remove C when the group remains at least two members.
3. Re-add C if needed.
4. A can remove B even while B is ADMIN when the group remains at least two members.
5. Re-add B; verify a removed/re-added former admin returns as MEMBER, not ADMIN.
6. Promote B again if continuing.

Verify each real mutation produces one activity and no duplicate member row.

## 6. Ownership transfer

1. A transfers ownership to B while B is ADMIN or MEMBER.
2. Verify B becomes the only OWNER.
3. Verify A becomes MEMBER.
4. Verify exactly one ownership-transfer activity.
5. Verify A immediately loses owner-only promote/demote/transfer controls.
6. Verify B gains them.
7. Verify A cannot perform an owner-only request using stale UI/API state.

Negative case: self-transfer is rejected/no-op and does not alter roles.

## 7. Leave behavior and minimum group size

1. A, now MEMBER, leaves the group while at least three members remain.
2. Verify A is evicted and one leave activity remains visible to active members.
3. Verify an ADMIN can leave under the same condition.
4. Verify the current OWNER cannot leave until ownership is transferred.
5. Reduce a group to two active members.
6. Verify remove/leave operations that would reduce it below two are blocked.

Expected: no orphan OWNER and no ACTIVE projection row absent from legacy `participantIds`.

## 8. Realtime and persistence

For each operation above:

1. Keep another member's chat screen open.
2. Confirm activity arrives through Socket.IO without manual refresh.
3. Kill/reopen the app.
4. Confirm the same activity is present from HTTP/local WatermelonDB history.
5. Confirm system activity rows are centered and cannot be replied to, swiped, reacted to, recalled, or opened via context menu.
6. Confirm normal messages before/after an activity retain existing scroll, anchor, reply, reaction, read-receipt, and media behavior.

## 9. Concurrency stress

Run each race several times with separate accounts/devices or parallel API calls:

### Admin demotion vs admin rename/add/remove

- A demotes B while B renames the group.
- A demotes B while B adds D.
- A demotes B while B removes C.

Expected: one operation wins according to transactional ordering. No unauthorized stale-admin write commits after demotion, and state remains consistent.

### Target promotion vs admin removal

- A promotes C to ADMIN while B tries to remove C as MEMBER.

Expected: B cannot commit removal against a target whose expected MEMBER role changed first.

### Ownership transfer vs role mutation

- A transfers ownership while another owner-only role mutation is sent concurrently.

Expected: stale owner operation conflicts rather than overwriting the new owner state.

After stress, rerun:

```bash
pnpm audit:conversation-members-v2
```

Require zero drift.

## 10. Direct chat regression

Test an existing direct conversation and verify unchanged behavior:

- send/receive text;
- optimistic send reconciliation;
- reply and reply jump;
- reaction;
- recall;
- image/video send;
- read receipt;
- online/last-seen/typing;
- 1:1 voice call entry point;
- reconnect/offline queue if practical.

No V2 member/role controls or group activities should appear in a direct chat.

## 11. Android and iOS

Run the group flow on both platforms, with extra attention to:

- Group Info scrolling and role controls;
- image picker + group photo upload;
- realtime member removal redirect;
- incoming activity auto-scroll near the bottom;
- no regression to Android chat auto-scroll behavior;
- reopening a group after app restart.

## 12. Explicitly out of scope

Do not fail this V2 pass because these are not implemented in this package:

- group voice/video calls;
- invite links;
- join approval;
- ban list;
- mute/mentions/pin/search Phase 2 work;
- join-boundary history;
- group disband.

Group calls must remain blocked until the separate Phase 4 Mediasoup implementation.

## Pass criteria

The V2 pass is acceptable only if all of the following are true:

- no projection drift after the full flow;
- exactly one OWNER at all times;
- no stale ADMIN/OWNER authorization succeeds after a concurrent role change;
- no duplicate ACTIVE member rows;
- no duplicate system activity for an idempotent request;
- system activity sidebar previews are readable;
- removed/left users lose realtime and API access;
- direct chats show no regression;
- Android and iOS physical-device flows both complete successfully.
