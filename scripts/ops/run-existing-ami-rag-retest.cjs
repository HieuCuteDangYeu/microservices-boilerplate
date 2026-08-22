#!/usr/bin/env node

/*
 * Runs the fixed AMI RAG questions through public production APIs only.
 * Each case gets a fresh group conversation so a prior assistant answer
 * cannot become conversational context for a later case.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const ROOT = path.resolve(__dirname, '../..');
const REPORT_DIR = path.join(ROOT, 'test-data/reel-integration/ami/reports');
const BOT_USER_ID = 'b6ddf921-c87c-4f68-8d71-f1b1fd33f3e7';
const REEL_IDS = [
  '9f5ed300-8b47-4715-a23f-d5082987ff43',
  'f9f57d92-7edf-4cc7-993a-24302bc3858b',
  '944c9e59-cc47-412c-aece-f378cf758d66',
  '487ebc29-697c-406c-8990-6d7a264c2c3c',
];

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message) {
  throw new Error(message);
}

async function retry(operation, description) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 4)
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error(
    `${description} failed after retries: ${lastError?.message || lastError}`,
  );
}

async function main() {
  const definitionsPath = arg('--definitions-report');
  if (!definitionsPath) fail('--definitions-report is required');
  dotenv.config({
    path: arg('--env-file') || path.join(ROOT, '.env.test.local'),
  });
  const baseUrl = process.env.BACKEND_URL;
  if (
    !baseUrl ||
    !process.env.VELORA_TEST_EMAIL ||
    !process.env.VELORA_TEST_PASSWORD
  ) {
    fail(
      'BACKEND_URL, VELORA_TEST_EMAIL, and VELORA_TEST_PASSWORD are required',
    );
  }
  const definitions = JSON.parse(fs.readFileSync(definitionsPath, 'utf8'));
  const allCases = definitions?.ragBenchmark?.cases;
  if (!Array.isArray(allCases) || allCases.length !== 8)
    fail('definitions report must contain exactly eight cases');
  const onlyCaseId = arg('--case-id');
  const cases = onlyCaseId
    ? allCases.filter((item) => item.caseId === onlyCaseId)
    : allCases;
  if (cases.length === 0) fail(`unknown --case-id ${onlyCaseId}`);

  let cookies = '';
  async function request(method, pathname, body) {
    const response = await fetch(new URL(pathname, baseUrl), {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookies ? { cookie: cookies } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie)
      cookies = setCookie
        .split(/,(?=\s*[^;=]+=)/)
        .map((value) => value.split(';')[0])
        .join('; ');
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    if (!response.ok)
      fail(
        `${method} ${pathname} -> ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`,
      );
    return payload;
  }

  await request('POST', '/auth/login', {
    email: process.env.VELORA_TEST_EMAIL,
    password: process.env.VELORA_TEST_PASSWORD,
  });
  const statuses = [];
  for (const reelId of REEL_IDS)
    statuses.push({
      reelId,
      status: await request('GET', `/content/reels/${reelId}/status`),
    });
  const nonCompleted = statuses.filter(
    ({ status }) => status?.status !== 'COMPLETED',
  );
  if (nonCompleted.length)
    fail(`reel status precondition failed: ${JSON.stringify(nonCompleted)}`);

  const startedAt = new Date().toISOString();
  const resultCases = [];
  for (const [index, definition] of cases.entries()) {
    const name = `AMI controlled RAG ${definition.caseId} ${Date.now()}`;
    const created = await request('POST', '/conversations', {
      participantIds: [BOT_USER_ID],
      type: 'GROUP',
      isGroup: true,
      name,
    });
    const conversationId = created?.id;
    if (!conversationId)
      fail(`conversation create returned no id for ${definition.caseId}`);
    for (const reelId of REEL_IDS) {
      await retry(
        () =>
          request('POST', `/content/reels/${reelId}/share`, {
            conversationId,
            sharedWithUserId: BOT_USER_ID,
          }),
        `share ${reelId} to ${conversationId}`,
      );
    }
    const before = await request(
      'GET',
      `/conversations/${conversationId}/messages?limit=50`,
    );
    const messages = Array.isArray(before) ? before : before?.messages;
    const accessibleReelIds = [
      ...new Set(
        (messages || [])
          .map((message) => message?.media?.reelId)
          .filter(Boolean),
      ),
    ].sort();
    if (
      JSON.stringify(accessibleReelIds) !== JSON.stringify([...REEL_IDS].sort())
    ) {
      fail(
        `conversation ${conversationId} has unexpected reel scope: ${JSON.stringify(accessibleReelIds)}`,
      );
    }
    const requestStartedAt = new Date().toISOString();
    const timer = Date.now();
    const userMessage = await request(
      'POST',
      `/conversations/${conversationId}/messages`,
      {
        clientMessageId: `ami-rag-${definition.caseId}-${crypto.randomUUID()}`,
        content: definition.question,
        type: 'text',
        signalType: 0,
      },
    );
    let assistantMessage;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const after = await request(
        'GET',
        `/conversations/${conversationId}/messages?limit=50`,
      );
      const rows = Array.isArray(after) ? after : after?.messages || [];
      assistantMessage = rows.find(
        (message) =>
          message?.senderId === BOT_USER_ID &&
          new Date(message.createdAt).getTime() >=
            new Date(userMessage.createdAt).getTime(),
      );
      if (assistantMessage) break;
    }
    if (!assistantMessage)
      fail(
        `bot response timeout for ${definition.caseId}; no further benchmark questions were sent`,
      );
    resultCases.push({
      ...definition,
      status: 'EVALUATED',
      conversationId,
      accessibleReelIds,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      requestStartedAt,
      responseCompletedAt: new Date().toISOString(),
      latencyMs: Date.now() - timer,
      finalAnswer: assistantMessage.content ?? '',
      citations:
        assistantMessage.metadata?.citations ??
        assistantMessage.citations ??
        [],
    });
    console.log(
      JSON.stringify({
        caseId: definition.caseId,
        conversationId,
        latencyMs: resultCases.at(-1).latencyMs,
      }),
    );
  }
  const report = {
    runId: `existing-ami-rag-retest-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    startedAt,
    mode: 'existing-ami-rag-retest-public-api',
    strategy:
      'one fresh supported group conversation per case; all four existing reels shared to BOT_USER_ID before the one authorised question',
    preRun: { reelStatuses: statuses, expectedReelIds: REEL_IDS },
    cases: resultCases,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, `${report.runId}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        reportPath,
        conversationIds: resultCases.map((item) => item.conversationId),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
