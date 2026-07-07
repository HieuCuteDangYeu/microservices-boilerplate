import { PushNotificationsService } from './push-notifications.service';

describe('PushNotificationsService retry scheduling', () => {
  const baseJob = {
    id: 'job-1',
    type: 'NEW_MESSAGE',
    recipientUserId: 'user-1',
    actorUserId: 'user-2',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    title: 'New message',
    body: 'You have a new message from Velora.',
    status: 'pending',
    attemptCount: 0,
    nextAttemptAt: null,
  };

  const createService = () => {
    const notificationJobsService = {
      createJob: jest.fn(),
      markProcessing: jest.fn(),
      markSkipped: jest.fn(),
      markSent: jest.fn(),
      markFailed: jest.fn(),
    };
    const pushTokensService = {
      findActiveByUserId: jest.fn(),
      deactivateById: jest.fn(),
    };
    const firebaseAdminService = {
      sendToToken: jest.fn(),
    };

    const service = new PushNotificationsService(
      notificationJobsService as never,
      pushTokensService as never,
      firebaseAdminService as never,
    );

    return {
      service,
      notificationJobsService,
      pushTokensService,
      firebaseAdminService,
    };
  };

  it('schedules the next attempt when every send fails before the max retry count', async () => {
    const {
      service,
      notificationJobsService,
      pushTokensService,
      firebaseAdminService,
    } = createService();
    const startedAt = Date.now();

    notificationJobsService.markProcessing.mockResolvedValue({
      ...baseJob,
      status: 'processing',
      attemptCount: 1,
    });
    pushTokensService.findActiveByUserId.mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        provider: 'fcm',
        platform: 'android',
        token: 'fcm-token-1',
      },
    ]);
    firebaseAdminService.sendToToken.mockRejectedValue({
      code: 'messaging/internal-error',
      message: 'FCM unavailable',
    });

    const result = await service.retryJob(baseJob as never);

    expect(result.status).toBe('failed');
    expect(notificationJobsService.markFailed).toHaveBeenCalledWith(
      'job-1',
      expect.stringContaining('token-1: messaging/internal-error'),
      expect.any(Date),
    );

    const scheduledAt = notificationJobsService.markFailed.mock.calls[0][2] as
      | Date
      | undefined;

    expect(scheduledAt).toBeInstanceOf(Date);
    expect(scheduledAt?.getTime()).toBeGreaterThanOrEqual(startedAt + 59_000);
    expect(scheduledAt?.getTime()).toBeLessThanOrEqual(startedAt + 61_000);
  });

  it('stops scheduling retries after the max retry count is reached', async () => {
    const {
      service,
      notificationJobsService,
      pushTokensService,
      firebaseAdminService,
    } = createService();

    notificationJobsService.markProcessing.mockResolvedValue({
      ...baseJob,
      status: 'processing',
      attemptCount: 3,
    });
    pushTokensService.findActiveByUserId.mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        provider: 'fcm',
        platform: 'android',
        token: 'fcm-token-1',
      },
    ]);
    firebaseAdminService.sendToToken.mockRejectedValue({
      code: 'messaging/internal-error',
      message: 'FCM unavailable',
    });

    await service.retryJob(baseJob as never);

    expect(notificationJobsService.markFailed).toHaveBeenCalledWith(
      'job-1',
      expect.stringContaining('token-1: messaging/internal-error'),
      undefined,
    );
  });
});
