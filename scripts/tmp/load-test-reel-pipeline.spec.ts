/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */

const loadTest: {
  calculatePercentiles(values: number[]): {
    count: number;
    p50: number | null;
    p95: number | null;
    max: number | null;
  };
  parseLoadTestConfig(
    env: Record<string, string>,
    pathExists: (fixture: string) => boolean,
  ): {
    apiUrl: string;
    token: string;
    fixture: string;
    total: number;
    concurrency: number;
    timeoutMs: number;
  };
  pollForTerminalStatus(options: {
    requestStatus: () => Promise<{ status: string }>;
    timeoutMs: number;
    intervalMs: number;
    now: () => number;
    sleep: (delayMs: number) => Promise<void>;
  }): Promise<{ status: string }>;
} = require('./load-test-reel-pipeline.cjs');

describe('reel pipeline baseline utilities', () => {
  it('calculates nearest-rank p50 and p95 values', () => {
    expect(loadTest.calculatePercentiles([10, 40, 20, 30, 50])).toEqual({
      count: 5,
      p50: 30,
      p95: 50,
      max: 50,
    });
  });

  it('parses and clamps load-test configuration', () => {
    expect(
      loadTest.parseLoadTestConfig(
        {
          REEL_LOAD_TEST_API_URL: 'http://localhost:3000/',
          REEL_LOAD_TEST_TOKEN: 'test-token',
          REEL_LOAD_TEST_FIXTURE: '/tmp/fixture.mp4',
          REEL_LOAD_TEST_TOTAL: '3',
          REEL_LOAD_TEST_CONCURRENCY: '5',
          REEL_LOAD_TEST_TIMEOUT_MS: '120000',
        },
        () => true,
      ),
    ).toEqual({
      apiUrl: 'http://localhost:3000',
      token: 'test-token',
      fixture: '/tmp/fixture.mp4',
      total: 3,
      concurrency: 3,
      timeoutMs: 120000,
    });
  });

  it('rejects a relative fixture path', () => {
    expect(() =>
      loadTest.parseLoadTestConfig(
        {
          REEL_LOAD_TEST_API_URL: 'http://localhost:3000',
          REEL_LOAD_TEST_TOKEN: 'test-token',
          REEL_LOAD_TEST_FIXTURE: 'fixture.mp4',
        },
        () => true,
      ),
    ).toThrow('REEL_LOAD_TEST_FIXTURE must be an absolute path.');
  });

  it('stops polling at the configured timeout', async () => {
    let clock = 0;

    await expect(
      loadTest.pollForTerminalStatus({
        requestStatus: () => Promise.resolve({ status: 'PROCESSING' }),
        timeoutMs: 100,
        intervalMs: 25,
        now: () => clock,
        sleep: (delayMs) => {
          clock += delayMs;
          return Promise.resolve();
        },
      }),
    ).rejects.toThrow('Polling timed out after 100ms.');
  });
});
