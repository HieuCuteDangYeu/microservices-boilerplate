#!/usr/bin/env node

if (process.env.CLOUDFLARE_TRANSCRIPTION_SMOKE !== 'true') {
  console.error(
    'Set CLOUDFLARE_TRANSCRIPTION_SMOKE=true to run this provider smoke test.',
  );
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const model = process.env.AI_TRANSCRIPTION_MODEL;
if (!accountId || !apiToken || !model) {
  console.error(
    'Cloudflare credentials and AI_TRANSCRIPTION_MODEL must be set.',
  );
  process.exit(1);
}

function silentWav() {
  const sampleRate = 16_000;
  const dataLength = sampleRate * 2;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataLength, 40);
  return wav;
}

async function main() {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'cf-aig-skip-cache': 'true',
      },
      body: JSON.stringify({
        audio: silentWav().toString('base64'),
        task: 'transcribe',
        vad_filter: true,
        condition_on_previous_text: false,
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok || payload?.success === false || !payload?.result) {
    throw new Error(`Transcription provider returned HTTP ${response.status}`);
  }
  const text = payload.result.text ?? payload.result.transcription_info?.text;
  if (typeof text !== 'string') {
    throw new Error('Transcription provider returned an invalid result shape.');
  }
  console.log('MODEL_ACTIVE=YES');
  console.log(`MODEL=${model}`);
  console.log(`HTTP=${response.status}`);
  console.log('SYNTHETIC_SILENCE_TRANSCRIPTION=PASS');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
