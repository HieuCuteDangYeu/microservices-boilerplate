const { PrismaClient } = require('@prisma/conversation-client');

const CONFIRM_TOKEN = 'BACKFILL_CONVERSATION_MEMBERS_V2';
const prisma = new PrismaClient();
const batchSize = Math.max(1, Number(process.env.BATCH_SIZE || 100));
const applyChanges = process.env.CONFIRM === CONFIRM_TOKEN;

const asJoinedAt = (memberJoinedAt, userId, fallback) => {
  if (
    memberJoinedAt &&
    typeof memberJoinedAt === 'object' &&
    !Array.isArray(memberJoinedAt) &&
    typeof memberJoinedAt[userId] === 'string'
  ) {
    const parsed = new Date(memberJoinedAt[userId]);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback;
};

const sameInstant = (left, right) =>
  left instanceof Date && right instanceof Date && left.getTime() === right.getTime();

async function reconcileConversation(conversation, stats) {
  const participantIds = Array.from(
    new Set(conversation.participantIds.filter((userId) => typeof userId === 'string' && userId)),
  );
  const participantSet = new Set(participantIds);
  const existingMembers = await prisma.conversationMember.findMany({
    where: { conversationId: conversation.id },
  });
  const existingByUserId = new Map(existingMembers.map((member) => [member.userId, member]));

  if (!participantSet.has(conversation.creatorId)) {
    stats.invalidGroups += 1;
    console.warn(
      `[conversation-members-v2] group ${conversation.id} has creator ${conversation.creatorId} outside participantIds`,
    );
  }

  for (const userId of participantIds) {
    const existing = existingByUserId.get(userId);
    const joinedAt = asJoinedAt(
      conversation.memberJoinedAt,
      userId,
      conversation.createdAt,
    );
    const expectedRole =
      userId === conversation.creatorId
        ? 'OWNER'
        : existing?.status === 'ACTIVE' && existing.role === 'ADMIN'
          ? 'ADMIN'
          : 'MEMBER';

    if (!existing) {
      stats.missingMembers += 1;
      if (applyChanges) {
        await prisma.conversationMember.create({
          data: {
            conversationId: conversation.id,
            userId,
            role: expectedRole,
            status: 'ACTIVE',
            joinedAt,
          },
        });
        stats.createdMembers += 1;
      }
      continue;
    }

    const needsUpdate =
      existing.role !== expectedRole ||
      existing.status !== 'ACTIVE' ||
      !sameInstant(existing.joinedAt, joinedAt) ||
      existing.leftAt !== null ||
      existing.removedBy !== null;

    if (!needsUpdate) {
      stats.alreadyConsistent += 1;
      continue;
    }

    stats.mismatchedMembers += 1;
    if (applyChanges) {
      await prisma.conversationMember.update({
        where: { id: existing.id },
        data: {
          role: expectedRole,
          status: 'ACTIVE',
          joinedAt,
          leftAt: null,
          removedBy: null,
        },
      });
      stats.updatedMembers += 1;
    }
  }

  for (const existing of existingMembers) {
    if (participantSet.has(existing.userId) || existing.status !== 'ACTIVE') {
      continue;
    }

    stats.orphanActiveMembers += 1;
    if (applyChanges) {
      await prisma.conversationMember.update({
        where: { id: existing.id },
        data: {
          status: 'REMOVED',
          ...(existing.role === 'OWNER' ? { role: 'MEMBER' } : {}),
        },
      });
      stats.deactivatedMembers += 1;
    }
  }
}

async function main() {
  if (!applyChanges) {
    console.log(
      `[conversation-members-v2] AUDIT ONLY. To apply changes, re-run with CONFIRM=${CONFIRM_TOKEN}`,
    );
  }

  const stats = {
    groupsScanned: 0,
    invalidGroups: 0,
    missingMembers: 0,
    mismatchedMembers: 0,
    orphanActiveMembers: 0,
    alreadyConsistent: 0,
    createdMembers: 0,
    updatedMembers: 0,
    deactivatedMembers: 0,
  };

  let cursorId;

  while (true) {
    const conversations = await prisma.conversation.findMany({
      where: { isGroup: true },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursorId
        ? {
            cursor: { id: cursorId },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        creatorId: true,
        participantIds: true,
        memberJoinedAt: true,
        createdAt: true,
      },
    });

    if (conversations.length === 0) {
      break;
    }

    for (const conversation of conversations) {
      stats.groupsScanned += 1;
      await reconcileConversation(conversation, stats);
    }

    cursorId = conversations[conversations.length - 1].id;
  }

  console.log(JSON.stringify({ mode: applyChanges ? 'apply' : 'audit', ...stats }, null, 2));

  if (!applyChanges && (stats.missingMembers || stats.mismatchedMembers || stats.orphanActiveMembers)) {
    process.exitCode = 2;
  }

  if (stats.invalidGroups > 0) {
    process.exitCode = 3;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
