const { PrismaClient } = require('@prisma/conversation-client');

const CONFIRM_TOKEN = 'BACKFILL_CONVERSATION_CLIENT_MESSAGE_IDS';
const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRM !== CONFIRM_TOKEN) {
    throw new Error(
      `Refusing to modify messages. Re-run with CONFIRM=${CONFIRM_TOKEN}`,
    );
  }

  // This is safe to run repeatedly. Historical messages were created before
  // clientMessageId became mandatory, so use their immutable Mongo _id as a
  // namespace-separated legacy id before creating the unique compound index.
  const result = await prisma.$runCommandRaw({
    update: 'messages',
    updates: [
      {
        q: {
          $or: [
            { clientMessageId: { $exists: false } },
            { clientMessageId: null },
            { clientMessageId: '' },
          ],
        },
        u: [
          {
            $set: {
              clientMessageId: {
                $concat: ['legacy:', { $toString: '$_id' }],
              },
            },
          },
        ],
        multi: true,
      },
    ],
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
