import { NotificationJob } from '../../domain/entities/notification-job.entity';
import type { INotificationJobRepository } from '../../domain/interfaces/notification-job.repository.interface';
import { ProcessNotificationJobUseCase } from './process-notification-job.use-case';
import { SendNewMessageNotificationUseCase } from './send-new-message-notification.use-case';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';

const makeJob = (recipientUserId: string, index: number) =>
  new NotificationJob({
    id: `job-${index}`,
    type: 'NEW_MESSAGE',
    recipientUserId,
    actorUserId: ACTOR_ID,
    conversationId: 'conversation-id',
    messageId: 'message-id',
    callId: null,
    title: 'Core Team',
    body: 'Alice: Hello there',
    dataJson: { type: 'NEW_MESSAGE' },
    expiresAt: null,
    status: 'pending',
    attemptCount: 0,
    nextAttemptAt: null,
  });

describe('SendNewMessageNotificationUseCase', () => {
  let notificationJobRepository: { create: jest.Mock };
  let processNotificationJob: { execute: jest.Mock };
  let useCase: SendNewMessageNotificationUseCase;

  beforeEach(() => {
    notificationJobRepository = {
      create: jest
        .fn()
        .mockImplementation((input) =>
          Promise.resolve(
            makeJob(
              input.recipientUserId,
              input.recipientUserId === MEMBER_ID ? 1 : 2,
            ),
          ),
        ),
    };
    processNotificationJob = {
      execute: jest.fn().mockImplementation((job: NotificationJob) =>
        Promise.resolve({
          jobId: job.id,
          status: 'sent',
        }),
      ),
    };
    useCase = new SendNewMessageNotificationUseCase(
      notificationJobRepository as unknown as INotificationJobRepository,
      processNotificationJob as unknown as ProcessNotificationJobUseCase,
    );
  });

  it('creates and processes one independent job for every unique recipient', async () => {
    const result = await useCase.execute({
      recipientUserIds: [MEMBER_ID, THIRD_ID, MEMBER_ID],
      actorUserId: ACTOR_ID,
      conversationId: 'conversation-id',
      messageId: 'message-id',
      title: 'Core Team',
      body: 'Alice: Hello there',
    });

    expect(notificationJobRepository.create).toHaveBeenCalledTimes(2);
    expect(notificationJobRepository.create).toHaveBeenNthCalledWith(1, {
      type: 'NEW_MESSAGE',
      recipientUserId: MEMBER_ID,
      actorUserId: ACTOR_ID,
      conversationId: 'conversation-id',
      messageId: 'message-id',
      title: 'Core Team',
      body: 'Alice: Hello there',
      dataJson: { type: 'NEW_MESSAGE' },
    });
    expect(notificationJobRepository.create).toHaveBeenNthCalledWith(2, {
      type: 'NEW_MESSAGE',
      recipientUserId: THIRD_ID,
      actorUserId: ACTOR_ID,
      conversationId: 'conversation-id',
      messageId: 'message-id',
      title: 'Core Team',
      body: 'Alice: Hello there',
      dataJson: { type: 'NEW_MESSAGE' },
    });
    expect(processNotificationJob.execute).toHaveBeenCalledTimes(2);
    expect(result.recipientCount).toBe(2);
    expect(result.results.map((entry) => entry.recipientUserId)).toEqual([
      MEMBER_ID,
      THIRD_ID,
    ]);
  });

  it('normalizes whitespace before deduplicating recipients defensively', async () => {
    const result = await useCase.execute({
      recipientUserIds: [` ${MEMBER_ID} `, MEMBER_ID, ''],
      actorUserId: ACTOR_ID,
      conversationId: 'conversation-id',
      messageId: 'message-id',
      title: 'Alice',
      body: 'Hello there',
    });

    expect(notificationJobRepository.create).toHaveBeenCalledTimes(1);
    expect(notificationJobRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: MEMBER_ID }),
    );
    expect(result.recipientCount).toBe(1);
  });

  it('returns an empty summary instead of creating jobs when no recipient survives normalization', async () => {
    const result = await useCase.execute({
      recipientUserIds: ['', '   '],
      actorUserId: ACTOR_ID,
      conversationId: 'conversation-id',
      messageId: 'message-id',
      title: 'Alice',
      body: 'Hello there',
    });

    expect(notificationJobRepository.create).not.toHaveBeenCalled();
    expect(processNotificationJob.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ recipientCount: 0, results: [] });
  });
});
