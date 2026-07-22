/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import { ConfigService } from '@nestjs/config';
import { FfmpegService, MediaProcessError } from './ffmpeg.service';

interface ProcessRunner {
  runProcess(
    commandName: 'ffmpeg' | 'ffprobe',
    commandPath: string,
    args: string[],
    options: { signal?: AbortSignal; timeoutMs: number },
  ): Promise<{ stdout: string; stderr: string }>;
}

describe('FfmpegService Phase 3 process controls', () => {
  const service = new FfmpegService(
    new ConfigService({
      FFMPEG_PATH: process.execPath,
      FFPROBE_PATH: process.execPath,
      MEDIA_PROCESS_STDERR_MAX_BYTES: '4096',
    }),
  );
  const runner = service as unknown as ProcessRunner;

  afterAll(() => service.onModuleDestroy());

  it('propagates exit status and bounds stderr', async () => {
    expect.assertions(4);

    try {
      await runner.runProcess(
        'ffmpeg',
        process.execPath,
        ['-e', "process.stderr.write('x'.repeat(10000)); process.exit(7)"],
        { timeoutMs: 5_000 },
      );
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(MediaProcessError);
      expect((error as MediaProcessError).exitCode).toBe(7);
      expect((error as MediaProcessError).stderr.length).toBeLessThanOrEqual(
        4096,
      );
      expect((error as MediaProcessError).command).toBe('ffmpeg');
    }
  });

  it('terminates a process after its timeout', async () => {
    await expect(
      runner.runProcess(
        'ffmpeg',
        process.execPath,
        ['-e', 'setInterval(() => undefined, 1000)'],
        { timeoutMs: 50 },
      ),
    ).rejects.toThrow('timed out after 50ms');
  });

  it('honors an already-aborted cancellation signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      runner.runProcess(
        'ffmpeg',
        process.execPath,
        ['-e', 'setInterval(() => undefined, 1000)'],
        { signal: controller.signal, timeoutMs: 5_000 },
      ),
    ).rejects.toThrow('was cancelled');
  });

  it('marks a process interrupted by service shutdown as retryable', async () => {
    const shutdownService = new FfmpegService(
      new ConfigService({
        FFMPEG_PATH: process.execPath,
        FFPROBE_PATH: process.execPath,
      }),
    );
    const shutdownRunner = shutdownService as unknown as ProcessRunner;
    const running = shutdownRunner.runProcess(
      'ffmpeg',
      process.execPath,
      ['-e', 'setInterval(() => undefined, 1000)'],
      { timeoutMs: 5_000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    shutdownService.onModuleDestroy();

    expect.assertions(3);
    try {
      await running;
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(MediaProcessError);
      expect((error as MediaProcessError).retryable).toBe(true);
      expect((error as MediaProcessError).message).toContain(
        'interrupted by service shutdown',
      );
    }
  });
});
