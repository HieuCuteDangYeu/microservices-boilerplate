# Socket.IO Room Namespace Rolling Migration

## Scope

This document covers the Phase 0.5 migration from legacy raw Socket.IO room keys to namespaced room keys in conversation-service. It does not change any client event name, payload, group product behavior, direct-chat contract, or call protocol.

Legacy rooms:

- user room: `<userId>`
- conversation room: `<conversationId>`

Target rooms:

- user room: `user:<userId>`
- conversation room: `conversation:<conversationId>`

## Stage 1 — Dual join / dual target

Implemented on `fix/group-membership-hardening-v1-1`.

Every authenticated socket joins both the legacy raw user room and the namespaced user room. Every authorized `join_conversation` joins both conversation room forms.

All conversation-service fanout paths target both room forms as a Socket.IO room union:

- conversation events
- new messages
- typing
- read receipts
- membership revocation
- presence/account fanout
- direct WebRTC signaling

The raw rooms remain active, so old conversation-service instances that emit only to raw rooms can still reach sockets connected to new instances. New instances target both forms, so sockets connected to old instances still receive events through the raw room.

Do not remove raw rooms during this stage.

## Stage 1 validation gate

Before moving forward, verify with at least two conversation-service instances using the Redis adapter:

1. old instance + new instance can both serve connected clients;
2. a client connected to an old instance receives events emitted by a new instance;
3. a client connected to a new instance receives events emitted by an old instance;
4. dual-joined sockets receive each event once;
5. removed/left members are evicted from both conversation room forms across nodes;
6. presence remains correct with multiple devices and mixed-version instances;
7. direct call signaling still reaches the intended account;
8. Android and iOS chat lifecycle behavior remains unchanged.

## Stage 2 — Namespaced canonical addressing

Only after every production conversation-service instance has Stage 1:

- keep joining both room forms temporarily;
- switch internal canonical helper output to prefer namespaced rooms;
- keep raw-room targeting available as compatibility fallback for one rollout window;
- verify logs/metrics show no dependency on raw-only membership.

No client API change should be necessary because clients emit logical events such as `join_conversation`; clients do not choose Socket.IO room keys.

## Stage 3 — Remove legacy raw rooms

After the compatibility window and validation:

- stop joining raw user rooms;
- stop joining raw conversation rooms;
- remove raw room targeting from emit/eviction/presence/signaling;
- keep only `user:<userId>` and `conversation:<conversationId>`.

This removal must be a separate reviewed change. Do not combine it with a feature rollout.

## Rollback

Stage 1 is rollback-safe because raw rooms remain intact. If namespaced behavior causes a regression, revert the dual-room changes and continue using raw rooms. Do not partially remove raw joins or raw targeting during rollback.

## Out of scope

- Group call enablement
- Group Chat V2 roles/admins
- ConversationMember migration
- Group E2EE
- Client event/payload renaming
