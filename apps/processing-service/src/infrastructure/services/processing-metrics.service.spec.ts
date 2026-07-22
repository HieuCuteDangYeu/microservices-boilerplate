/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

import { ProcessingStageTimer } from './processing-metrics.service';

describe('ProcessingStageTimer', () => {
  it('records a successful stage duration exactly once', () => {
    const completions: Array<{
      success: boolean;
      durationMs: number;
      failureStage?: string;
    }> = [];
    const readings = [100, 145, 200];
    const timer = new ProcessingStageTimer(
      (success, durationMs, failureStage) => {
        completions.push({ success, durationMs, failureStage });
      },
      () => readings.shift() ?? 200,
    );

    expect(timer.succeed()).toBe(45);
    expect(timer.fail('LATE_FAILURE')).toBe(0);
    expect(completions).toEqual([
      {
        success: true,
        durationMs: 45,
        failureStage: undefined,
      },
    ]);
  });

  it('records the failure stage', () => {
    const completion = jest.fn();
    const readings = [10, 25];
    const timer = new ProcessingStageTimer(
      completion,
      () => readings.shift() ?? 25,
    );

    expect(timer.fail('TRANSCODING')).toBe(15);
    expect(completion).toHaveBeenCalledWith(
      false,
      15,
      'TRANSCODING',
      undefined,
    );
  });
});
