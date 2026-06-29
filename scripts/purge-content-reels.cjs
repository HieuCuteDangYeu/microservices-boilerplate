const {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} = require('@aws-sdk/client-s3');
const { PrismaClient } = require('@prisma/content-client');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const https = require('https');

const prisma = new PrismaClient();

const DELETE_CHUNK_SIZE = 1000;
const CONFIRM_TOKEN = 'DELETE_CONTENT_REELS';

function parseArgs() {
  return {
    dryRun: process.env.DRY_RUN === '1',
    confirm: process.env.CONFIRM || '',
    reelId: process.env.REEL_ID || undefined,
    r2Prefix: process.env.R2_REELS_PREFIX || 'reels/',
  };
}

function createR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestHandler: new NodeHttpHandler({
      httpsAgent: new https.Agent({ family: 4 }),
    }),
  });
}

async function listObjectKeys(s3Client, bucketName, prefix) {
  const normalizedPrefix = prefix.replace(/^\/+/, '').trim();
  const keys = [];
  let continuationToken;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: normalizedPrefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (object.Key) {
        keys.push(object.Key);
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

async function deleteObjectKeys(s3Client, bucketName, keys) {
  const filtered = keys
    .map((key) => key.replace(/^\/+/, '').trim())
    .filter((key) => key.length > 0);

  for (let index = 0; index < filtered.length; index += DELETE_CHUNK_SIZE) {
    const chunk = filtered.slice(index, index + DELETE_CHUNK_SIZE);

    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

function buildReelPrefixes(reel) {
  const prefixes = new Set();
  const normalizedMediaKey = reel.mediaKey.replace(/^\/+/, '').trim();
  const mediaPrefix = normalizedMediaKey.replace(/\.[^.]+$/, '');

  prefixes.add(normalizedMediaKey);
  prefixes.add(`${mediaPrefix}/`);

  if (reel.thumbnailKey) {
    prefixes.add(reel.thumbnailKey.replace(/^\/+/, '').trim());
  }

  return [...prefixes];
}

async function collectSpecificReelObjects(s3Client, bucketName, reels) {
  const keys = new Set();

  for (const reel of reels) {
    const prefixes = buildReelPrefixes(reel);

    for (const prefix of prefixes) {
      if (prefix.endsWith('/')) {
        const prefixedKeys = await listObjectKeys(s3Client, bucketName, prefix);
        prefixedKeys.forEach((key) => keys.add(key));
      } else {
        keys.add(prefix);
      }
    }
  }

  return [...keys];
}

async function main() {
  const { dryRun, confirm, reelId, r2Prefix } = parseArgs();
  const bucketName = process.env.R2_BUCKET_NAME;
  const s3Client = createR2Client();

  const where = reelId ? { id: reelId } : undefined;
  const [reels, chunkCount, shareCount, shareLinkCount] = await Promise.all([
    prisma.reel.findMany({
      where,
      select: {
        id: true,
        mediaKey: true,
        thumbnailKey: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    }),
    prisma.reelChunk.count({
      where: reelId ? { reelId } : undefined,
    }),
    prisma.reelShare.count({
      where: reelId ? { reelId } : undefined,
    }),
    prisma.reelShareLink.count({
      where: reelId ? { reelId } : undefined,
    }),
  ]);

  const r2Keys = reelId
    ? await collectSpecificReelObjects(s3Client, bucketName, reels)
    : await listObjectKeys(s3Client, bucketName, r2Prefix);

  console.log(
    JSON.stringify(
      {
        dryRun,
        scope: reelId ? 'single-reel' : 'all-reels',
        reelId: reelId || null,
        reels: reels.length,
        reelChunks: chunkCount,
        reelShares: shareCount,
        reelShareLinks: shareLinkCount,
        r2Objects: r2Keys.length,
        r2Prefix: reelId ? null : r2Prefix,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.log('Dry run finished. No database rows or R2 objects were deleted.');
    return;
  }

  if (confirm !== CONFIRM_TOKEN) {
    throw new Error(
      `Refusing destructive purge. Re-run with CONFIRM=${CONFIRM_TOKEN}`,
    );
  }

  if (r2Keys.length > 0) {
    await deleteObjectKeys(s3Client, bucketName, r2Keys);
  }

  if (reelId) {
    await prisma.reel.deleteMany({
      where: { id: reelId },
    });
  } else {
    await prisma.reel.deleteMany();
  }

  console.log(
    `Deleted ${reels.length} reel records and ${r2Keys.length} R2 objects.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
