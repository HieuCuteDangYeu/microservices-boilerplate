/**
 * TEMPORARY REFACTOR TEST
 * Remove during Phase 10 after production validation.
 */

/* eslint-disable @typescript-eslint/unbound-method */

import type { ReelMediaJob } from '@common/processing/interfaces/reel-media-job.interface';
import type { RmqContext } from '@nestjs/microservices';
import type { ProcessChatVideoUseCase } from '@processing/application/use-cases/process-chat-video.use-case';
import type { ProcessReelUseCase } from '@processing/application/use-cases/process-reel.use-case';
import type { IReelMediaRetryPublisher } from '@processing/domain/interfaces/reel-media-retry-publisher.interface';
import { MediaProcessingController } from './media-processing.controller';

function buildJob(): ReelMediaJob {
  return {
    jobId: 'job-1',
    reelId: 'reel-1',
    userId: 'user-1',
    mediaKey: 'reels/user-1/reel-1.mp4',
    mediaAttemptId: 'attempt-1',
    expectedLengthClass: 'SHORT',
    tags: [],
    createdAt: '2026-07-22T00:00:00.000Z',
    schemaVersion: 1,
  };
}

function buildContext(input: { redelivered?: boolean; retryNumber?: number }) {
  const message = {
    fields: { redelivered: input.redelivered ?? false },
    properties: {
      headers: { 'x-reel-retry-count': input.retryNumber ?? 0 },
    },
  };
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const context = {
    getMessage: () => message,
    getChannelRef: () => channel,
  } as unknown as RmqContext;

  return { channel, context, message };
}

function buildController() {
  const processReelUseCase = {
    execute: jest.fn(),
  } as unknown as ProcessReelUseCase;
  const processChatVideoUseCase = {
    execute: jest.fn(),
  } as unknown as ProcessChatVideoUseCase;
  const retryPublisher: IReelMediaRetryPublisher = {
    publishRetry: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new MediaProcessingController(
    processReelUseCase,
    processChatVideoUseCase,
    retryPublisher,
  );

  return {
    controller,
    execute: processReelUseCase.execute as jest.Mock,
    retryPublisher,
  };
}

describe('MediaProcessingController Phase 1 delivery semantics', () => {
  it.each(['COMPLETED', 'DUPLICATE_OR_STALE'] as const)(
    'acknowledges %s only after durable handling',
    async (status) => {
      const { controller, execute } = buildController();
      const { channel, context, message } = buildContext({ redelivered: true });
      execute.mockResolvedValue({ status });

      await controller.handleReelMediaJob(buildJob(), context);

      expect(channel.ack).toHaveBeenCalledWith(message);
      expect(channel.nack).not.toHaveBeenCalled();
    },
  );

  it('requeues when the worker stops before durable handling', async () => {
    const { controller, execute } = buildController();
    const { channel, context, message } = buildContext({});
    execute.mockRejectedValue(new Error('worker stopped'));

    await controller.handleReelMediaJob(buildJob(), context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });

  it('publishes a transient failure to the first retry lane before ack', async () => {
    const { controller, execute, retryPublisher } = buildController();
    const { channel, context, message } = buildContext({ retryNumber: 0 });
    const job = buildJob();
    execute.mockResolvedValue({
      status: 'RETRY',
      failureStage: 'DOWNLOADING',
      errorDetail: 'temporary storage error',
    });

    await controller.handleReelMediaJob(job, context);

    expect(retryPublisher.publishRetry).toHaveBeenCalledWith(job, 1);
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('dead-letters a durably recorded permanent failure', async () => {
    const { controller, execute } = buildController();
    const { channel, context, message } = buildContext({});
    execute.mockResolvedValue({
      status: 'PERMANENT_FAILURE',
      failureStage: 'VIDEO_TOO_LONG',
      errorDetail: 'invalid source',
    });

    await controller.handleReelMediaJob(buildJob(), context);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });

  it('dead-letters a malformed media job without invoking processing', async () => {
    const { controller, execute } = buildController();
    const { channel, context, message } = buildContext({});

    await controller.handleReelMediaJob({ malformed: true }, context);

    expect(execute).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
  });
});
