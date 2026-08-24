#!/usr/bin/env node

if (process.env.CLOUDFLARE_VISION_SMOKE !== 'true') {
  console.error(
    'Set CLOUDFLARE_VISION_SMOKE=true to run this provider smoke test.',
  );
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const model = process.env.AI_VISION_MODEL;
if (!accountId || !apiToken || !model) {
  console.error('Cloudflare credentials and AI_VISION_MODEL must be set.');
  process.exit(1);
}

async function main() {
  const syntheticPng = createSyntheticPng();
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'cf-aig-skip-cache': 'true',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'Return only JSON with caption, ocrText, and objects. Describe only the supplied synthetic frame.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this synthetic image.' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${syntheticPng.toString('base64')}`,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.errors
        ?.map((item) => item?.message)
        .filter(Boolean)
        .join('; ') ||
      'unknown provider error';
    throw new Error(
      `Vision provider returned HTTP ${response.status}: ${message}`,
    );
  }
  const content = payload?.choices?.[0]?.message?.content;
  const parsed =
    content && typeof content === 'object'
      ? content
      : typeof content === 'string'
        ? JSON.parse(content.trim())
        : undefined;
  if (
    !parsed ||
    typeof parsed.caption !== 'string' ||
    typeof parsed.ocrText !== 'string' ||
    !Array.isArray(parsed.objects) ||
    parsed.objects.some((item) => typeof item !== 'string')
  ) {
    throw new Error('Vision provider returned schema-incompatible JSON.');
  }
  console.log('MODEL_ACTIVE=YES');
  console.log(`MODEL=${model}`);
  console.log(`HTTP=${response.status}`);
  console.log('MULTIMODAL_INPUT=PASS');
  console.log('JSON_OBJECT=PASS');
}

function createSyntheticPng() {
  const { deflateSync } = require('node:zlib');
  const width = 16;
  const height = 16;
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let row = 0; row < height; row += 1) {
    const offset = row * (1 + width * 3);
    rows[offset] = 0;
    for (let column = 0; column < width; column += 1) {
      rows[offset + 1 + column * 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
