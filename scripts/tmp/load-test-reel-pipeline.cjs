const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);
const TERMINAL_INDEX_STATUSES = new Set(['COMPLETED', 'DEGRADED', 'FAILED']);

function isTerminalPipelineStatus(status) {
  if (!TERMINAL_STATUSES.has(status.status)) return false;
  if (status.status === 'FAILED' || !status.indexStatus) return true;
  return TERMINAL_INDEX_STATUSES.has(status.indexStatus);
}

function parsePositiveInteger(value, fallback, name) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseLoadTestConfig(env = process.env, pathExists = fs.existsSync) {
  const apiUrl = env.REEL_LOAD_TEST_API_URL?.trim().replace(/\/+$/, '');
  const token = env.REEL_LOAD_TEST_TOKEN?.trim();
  const refreshToken = env.REEL_LOAD_TEST_REFRESH_TOKEN?.trim();
  const fixture = env.REEL_LOAD_TEST_FIXTURE?.trim();
  const titlePrefix =
    env.REEL_LOAD_TEST_TITLE_PREFIX?.trim() || 'Phase 0 pipeline baseline';
  const tag = env.REEL_LOAD_TEST_TAG?.trim() || 'phase-0-baseline';

  if (!apiUrl) {
    throw new Error('REEL_LOAD_TEST_API_URL is required.');
  }

  try {
    const parsedUrl = new URL(apiUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new Error('REEL_LOAD_TEST_API_URL must be an HTTP(S) URL.');
  }

  if (!token) {
    throw new Error('REEL_LOAD_TEST_TOKEN is required.');
  }

  if (!fixture) {
    throw new Error('REEL_LOAD_TEST_FIXTURE is required.');
  }

  if (!path.isAbsolute(fixture)) {
    throw new Error('REEL_LOAD_TEST_FIXTURE must be an absolute path.');
  }

  if (!pathExists(fixture)) {
    throw new Error(`REEL_LOAD_TEST_FIXTURE does not exist: ${fixture}`);
  }

  const total = parsePositiveInteger(
    env.REEL_LOAD_TEST_TOTAL,
    10,
    'REEL_LOAD_TEST_TOTAL',
  );
  const concurrency = Math.min(
    total,
    parsePositiveInteger(
      env.REEL_LOAD_TEST_CONCURRENCY,
      5,
      'REEL_LOAD_TEST_CONCURRENCY',
    ),
  );
  const timeoutMs = parsePositiveInteger(
    env.REEL_LOAD_TEST_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    'REEL_LOAD_TEST_TIMEOUT_MS',
  );
  const clientObservedDurationMs = env.REEL_LOAD_TEST_CLIENT_DURATION_MS
    ? parsePositiveInteger(
        env.REEL_LOAD_TEST_CLIENT_DURATION_MS,
        undefined,
        'REEL_LOAD_TEST_CLIENT_DURATION_MS',
      )
    : undefined;

  return {
    apiUrl,
    token,
    ...(refreshToken ? { refreshToken } : {}),
    fixture,
    total,
    concurrency,
    timeoutMs,
    clientObservedDurationMs,
    titlePrefix,
    tag,
  };
}

function calculatePercentiles(values) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (sorted.length === 0) {
    return { count: 0, p50: null, p95: null, max: null };
  }

  const nearestRank = (percentile) =>
    sorted[
      Math.max(
        0,
        Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1),
      )
    ];

  return {
    count: sorted.length,
    p50: nearestRank(0.5),
    p95: nearestRank(0.95),
    max: sorted[sorted.length - 1],
  };
}

async function pollForTerminalStatus(options) {
  const {
    requestStatus,
    timeoutMs,
    intervalMs = 2000,
    now = Date.now,
    sleep = (delayMs) =>
      new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      }),
  } = options;
  const startedAt = now();

  while (now() - startedAt < timeoutMs) {
    const status = await requestStatus();

    if (isTerminalPipelineStatus(status)) {
      return status;
    }

    await sleep(intervalMs);
  }

  throw new Error(`Polling timed out after ${timeoutMs}ms.`);
}

function inferMimeType(fixture) {
  switch (path.extname(fixture).toLowerCase()) {
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    default:
      return 'video/mp4';
  }
}

async function fetchJson(url, options, timeoutMs) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const responseText = await response.text();
  let body;

  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch {
    body = { message: responseText };
  }

  if (!response.ok) {
    const message =
      typeof body.message === 'string'
        ? body.message
        : `HTTP ${response.status}`;
    const error = new Error(
      `${response.status} ${response.statusText}: ${message}`,
    );
    error.status = response.status;
    throw error;
  }

  return body;
}

function extractCookie(headers, name) {
  const prefix = `${name}=`;
  for (const header of headers.getSetCookie()) {
    const value = header
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    if (value) return value.slice(prefix.length);
  }
  return undefined;
}

function createAuthenticatedJsonFetcher(config) {
  let accessToken = config.token;
  let refreshToken = config.refreshToken;

  const request = (url, options) =>
    fetchJson(
      url,
      {
        ...options,
        headers: {
          ...options?.headers,
          authorization: `Bearer ${accessToken}`,
        },
      },
      config.timeoutMs,
    );

  return async (url, options) => {
    try {
      return await request(url, options);
    } catch (error) {
      if (error?.status !== 401 || !refreshToken) throw error;

      const response = await fetch(`${config.apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { cookie: `refresh_token=${refreshToken}` },
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText}`,
        );
      }
      accessToken = extractCookie(response.headers, 'access_token');
      refreshToken =
        extractCookie(response.headers, 'refresh_token') ?? refreshToken;
      if (!accessToken) {
        throw new Error('Token refresh did not return an access token.');
      }
      return await request(url, options);
    }
  };
}

async function runOne(config, index) {
  const fetchAuthenticatedJson = createAuthenticatedJsonFetcher(config);
  const fileType = inferMimeType(config.fixture);
  const fixtureBytes = fs.statSync(config.fixture).size;
  const startedAt = Date.now();

  const uploadUrlStartedAt = Date.now();
  const uploadTarget = await fetchAuthenticatedJson(
    `${config.apiUrl}/media/upload-url`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fileType, purpose: 'reel' }),
    },
  );
  const uploadUrlDurationMs = Date.now() - uploadUrlStartedAt;

  const uploadStartedAt = Date.now();
  const uploadResponse = await fetch(uploadTarget.uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': fileType,
      'content-length': String(fixtureBytes),
    },
    body: fs.createReadStream(config.fixture),
    duplex: 'half',
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Fixture upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
    );
  }

  const uploadDurationMs = Date.now() - uploadStartedAt;
  const createStartedAt = Date.now();
  const reel = await fetchAuthenticatedJson(
    `${config.apiUrl}/content/reels`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        mediaKey: uploadTarget.key,
        title: `${config.titlePrefix} ${index + 1}`,
        tags: [config.tag],
        visibility: 'private',
        ...(config.clientObservedDurationMs
          ? { clientObservedDurationMs: config.clientObservedDurationMs }
          : {}),
      }),
    },
  );
  const createDurationMs = Date.now() - createStartedAt;
  const processingStartedAt = Date.now();
  const status = await pollForTerminalStatus({
    timeoutMs: config.timeoutMs,
    requestStatus: () =>
      fetchAuthenticatedJson(
        `${config.apiUrl}/content/reels/${reel.id}/status`,
        {},
      ),
  });

  const pipelineStatus =
    status.mediaStatus === 'FAILED' || status.indexStatus === 'FAILED'
      ? 'FAILED'
      : status.indexStatus === 'DEGRADED'
        ? 'DEGRADED'
        : status.status;

  return {
    index,
    reelId: reel.id,
    mediaKey: uploadTarget.key,
    status: pipelineStatus,
    mediaStatus: status.mediaStatus,
    indexStatus: status.indexStatus,
    stage: status.stage,
    message: status.message,
    uploadUrlDurationMs,
    uploadDurationMs,
    createDurationMs,
    processingDurationMs: Date.now() - processingStartedAt,
    totalDurationMs: Date.now() - startedAt,
  };
}

async function runWithConcurrency(total, concurrency, worker) {
  const results = new Array(total);
  let nextIndex = 0;

  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= total) {
        return;
      }

      try {
        results[index] = await worker(index);
      } catch (error) {
        results[index] = {
          index,
          status: 'ERROR',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  });

  await Promise.all(runners);
  return results;
}

async function main() {
  const config = parseLoadTestConfig();
  const fixtureStats = fs.statSync(config.fixture);
  const results = await runWithConcurrency(
    config.total,
    config.concurrency,
    (index) => runOne(config, index),
  );
  const completed = results.filter((result) => result.status === 'COMPLETED');
  const failed = results.filter((result) => result.status === 'FAILED');
  const degraded = results.filter((result) => result.status === 'DEGRADED');
  const errors = results.filter((result) => result.status === 'ERROR');

  process.stdout.write(
    `${JSON.stringify(
      {
        fixture: config.fixture,
        fixtureBytes: fixtureStats.size,
        total: config.total,
        concurrency: config.concurrency,
        completed: completed.length,
        failed: failed.length,
        degraded: degraded.length,
        errors: errors.length,
        processingDurationMs: calculatePercentiles(
          results.map((result) => result.processingDurationMs),
        ),
        totalDurationMs: calculatePercentiles(
          results.map((result) => result.totalDurationMs),
        ),
        results,
      },
      null,
      2,
    )}\n`,
  );

  if (errors.length > 0 || failed.length > 0 || degraded.length > 0) {
    process.exitCode = 1;
  }
}

module.exports = {
  calculatePercentiles,
  createAuthenticatedJsonFetcher,
  extractCookie,
  isTerminalPipelineStatus,
  parseLoadTestConfig,
  pollForTerminalStatus,
  runWithConcurrency,
};

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(
      `Reel pipeline load test failed: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
