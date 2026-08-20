# Phase 0.5 Mobile / Realtime Architecture Audit

## Scope

This audit is based on the current `lequan170205/Velora-Mobile` `main` implementation and the current conversation-service feature branch. It defines safe extraction boundaries without changing the existing message timeline protocol or Group Chat V1 product behavior.

No Group Chat V2 feature is included here.

## Current SocketProvider responsibilities

`src/providers/SocketProvider.tsx` currently owns all of the following inside one provider/effect graph:

- Socket creation/auth/reconnect lifecycle
- Network online/offline coordination
- User presence request and presence events
- Conversation room restoration/rejoin
- Conversation created/updated/removed lifecycle
- Revocation cleanup and local database deletion
- Offline text queue recovery, ACK timeout and retry
- New message reconciliation
- Conversation activity/unread updates
- Optimistic message confirmation/failure
- Bot streaming
- Recall and reply-preview updates
- Reaction updates
- Media-processing updates
- Read receipt/frontier updates
- Query cache and Watermelon/local persistence synchronization

The existing behavior is stable but the provider is now a high-risk change surface because unrelated realtime features share the same closure and cleanup lifecycle.

## Recommended SocketProvider extraction order

The extraction must preserve event names, payloads, cache semantics and reconnect behavior.

### Step A — Extract handler registration only

Create handler modules that receive their dependencies explicitly and return cleanup/unsubscribe functions. Do not change the socket protocol.

Suggested modules:

- `conversationLifecycleHandlers`
  - `conversation_created`
  - `conversation_updated`
  - `conversation_removed`
  - room restore/rejoin helpers
- `messageRealtimeHandlers`
  - `new_message`
  - `conversation_message_activity`
  - `message_synced`
  - `message_failed`
  - recall/reply/reaction events
- `readReceiptHandlers`
  - `messages_seen`
  - read-frontier cache/local persistence logic
- `presenceHandlers`
  - `user:online`
  - `user:offline`
  - `presence_update`
  - presence request helper
- `mediaHandlers`
  - `media_processing_completed`
  - `media_processing_failed`
  - local poster/file cleanup

Keep connection/auth/network/offline-queue orchestration in `SocketProvider` during the first extraction. That minimizes simultaneous lifecycle changes.

### Step B — Extract offline queue lifecycle

Only after Step A has regression coverage, isolate:

- pending message recovery
- per-conversation serialization
- ACK timeout tracking
- retry scheduling
- queue flush on reconnect/network recovery

Do not mix this with message timeline changes.

## Current ChatScreen responsibilities

`app/conversation/[id].tsx` currently owns rendering plus substantial lifecycle and realtime-derived behavior:

- latest vs anchor timeline state
- FlashList scrolling/follow-bottom
- Android/iOS scroll differences
- reply-jump/anchor navigation
- optimistic send scroll transactions
- media batch scroll transactions
- typing emit/timeout
- read-frontier emit
- presence request/rendering
- group/direct header resolution
- direct-call gating
- group read receipt/avatar placement
- revocation navigation
- keyboard/context-menu preservation
- media viewer/save behavior
- conversation UI cleanup

The timeline/scroll block has accumulated several physical-device regression fixes and should not be broadly rewritten.

## Recommended ChatScreen extraction order

### Step 1 — Low-risk lifecycle hooks

Extract behavior that does not own FlashList ordering or scroll state:

- `useConversationLifecycle`
  - delayed `join_conversation`
  - revoked-conversation navigation
  - conversation-scoped cleanup
- `useConversationTyping`
  - `typing_start`
  - `typing_stop`
  - timeout cleanup
- `useConversationPermissions`
  - direct/group identity resolution
  - group call gating
  - direct peer resolution
- `useConversationPresence`
  - direct-chat presence request
  - last-seen refresh tick

### Step 2 — Read receipt derivation

Extract group/direct receipt-map derivation into `useGroupReadReceipts` or a pure selector/helper while preserving the existing direct-chat behavior exactly.

Do not change the backend `messages_seen` frontier contract in this step.

### Step 3 — Header split

After the hooks are stable, split presentation only:

- `ConversationHeader`
- `DirectHeader`
- `GroupHeader`

The header components should receive already-resolved permissions/identity props and should not own socket/cache logic.

### Step 4 — Leave MessageTimeline stable

Do not extract or rewrite the following until runtime coverage exists:

- newest-message follow-bottom logic
- Android outgoing/incoming scroll behavior
- anchor timeline transition
- reply-jump settling
- media batch scroll suppression
- FlashList layout/index refs
- keyboard/context-menu geometry

These are the highest regression-risk areas.

## Runtime / Maestro coverage required before timeline extraction

Minimum scenarios:

1. Direct chat send remains optimistic and scrolls correctly on Android and iOS.
2. Incoming direct message follows bottom only when appropriate.
3. Group incoming message has the same smooth-scroll behavior.
4. Ownership transfer updates Group Info without reopening the app.
5. Added member receives the group and can join the room.
6. Removed member receives `conversation_removed`, exits an open chat and loses local state.
7. Member leave clears local state without disconnecting the account socket.
8. Reconnect restores only currently authorized conversations.
9. Group read/avatar receipts advance in realtime.
10. Direct presence/last-seen behavior remains unchanged.
11. Offline queued messages reconcile exactly once after reconnect.
12. Direct voice-call controls remain hidden for groups and functional for direct chats.

## Current implementation status

Backend room migration Stage 1 is implemented on `fix/group-membership-hardening-v1-1` using dual legacy/namespaced room joins and targets.

Mobile extraction has been audited against current `main`, but no mobile source is modified by this backend branch. The extraction should not be performed directly on mobile `main`; it needs a safe mobile working ref before source changes are applied.
