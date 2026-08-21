import { ConfigService } from '@nestjs/config';
import { Conversation } from '../../domain/entities/conversation.entity';
import { Message } from '../../domain/entities/message.entity';
import { NotificationServiceAdapter } from './notification-service.adapter';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const THIRD_ID = '33333333-3333-4333-8333-333333333333';

const okResponse = (status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue('response body'),
  }) as unknown as Response;

const makeMessage = (partial: Partial<Message> = {}) =>
  new Message({
    id: 'message-id',
    conversationId: 'conversation-id',
    senderId: ACTOR_ID,
    signalType: 1,
    content: 'Hello there',
    type: 'text',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    ...partial,
  });

const makeAdapter = () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'NOTIFICATION_SERVICE_URL') {
        return 'http://notification-service:3015';
      }

      if (key === 'NOTIFICATION_INTERNAL_SECRET') {
        return 'internal-secret';
      }

      return undefined;
    }),
  } as unknown as ConfigService;

  return new NotificationServiceAdapter(configService);
};

describe('NotificationServiceAdapter message fanout', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves direct-chat notification title and body', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const adapter = makeAdapter();
    const conversation = new Conversation({
      id: 'conversation-id',
      creatorId: ACTOR_ID,
      participantIds: [ACTOR_ID, MEMBER_ID],
      participants: [
        { id: ACTOR_ID, name: 'Alice' },
        { id: MEMBER_ID, name: 'Bob' },
      ],
      isGroup: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await adapter.notifyNewMessage(conversation, makeMessage(), ACTOR_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({
      recipientUserIds: [MEMBER_ID],
      actorUserId: ACTOR_ID,
      conversationId: 'conversation-id',
      messageId: 'message-id',
      title: 'Alice',
      body: 'Hello there',
    });
  });

  it('fans a group notification out to every unique participant except the sender', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const adapter = makeAdapter();
    const conversation = new Conversation({
      id: 'conversation-id',
      creatorId: ACTOR_ID,
      participantIds: [ACTOR_ID, MEMBER_ID, THIRD_ID, MEMBER_ID],
      participants: [
        { id: ACTOR_ID, name: 'Alice' },
        { id: MEMBER_ID, name: 'Bob' },
        { id: THIRD_ID, name: 'Charlie' },
      ],
      name: 'Core Team',
      isGroup: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await adapter.notifyNewMessage(conversation, makeMessage(), ACTOR_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({
      recipientUserIds: [MEMBER_ID, THIRD_ID],
      actorUserId: ACTOR_ID,
      conversationId: 'conversation-id',
      messageId: 'message-id',
      title: 'Core Team',
      body: 'Alice: Hello there',
    });
  });

  it('uses stable group fallbacks when metadata enrichment is unavailable', async () => {
    fetchMock.mockResolvedValue(okResponse());
    const adapter = makeAdapter();
    const conversation = new Conversation({
      id: 'conversation-id',
      creatorId: ACTOR_ID,
      participantIds: [ACTOR_ID, MEMBER_ID],
      isGroup: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await adapter.notifyNewMessage(
      conversation,
      makeMessage({ content: '', type: 'image' }),
      ACTOR_ID,
    );

    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual(
      expect.objectContaining({
        recipientUserIds: [MEMBER_ID],
        title: 'Group chat',
        body: 'Someone: [Image]',
      }),
    );
  });

  it('falls back to the legacy singular contract only when the batch schema returns 400', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse(400))
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(okResponse());
    const adapter = makeAdapter();
    const conversation = new Conversation({
      id: 'conversation-id',
      creatorId: ACTOR_ID,
      participantIds: [ACTOR_ID, MEMBER_ID, THIRD_ID],
      participants: [{ id: ACTOR_ID, name: 'Alice' }],
      name: 'Core Team',
      isGroup: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await adapter.notifyNewMessage(conversation, makeMessage(), ACTOR_ID);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const legacyBodies = fetchMock.mock.calls
      .slice(1)
      .map(([, request]) => JSON.parse(request.body));
    expect(legacyBodies).toEqual([
      expect.objectContaining({
        recipientUserId: MEMBER_ID,
        actorUserId: ACTOR_ID,
        title: 'Core Team',
        body: 'Alice: Hello there',
      }),
      expect.objectContaining({
        recipientUserId: THIRD_ID,
        actorUserId: ACTOR_ID,
        title: 'Core Team',
        body: 'Alice: Hello there',
      }),
    ]);
  });

  it('does not legacy-retry a 5xx response because the batch may have partially processed', async () => {
    fetchMock.mockResolvedValue(okResponse(500));
    const adapter = makeAdapter();
    const conversation = new Conversation({
      id: 'conversation-id',
      creatorId: ACTOR_ID,
      participantIds: [ACTOR_ID, MEMBER_ID, THIRD_ID],
      name: 'Core Team',
      isGroup: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await adapter.notifyNewMessage(conversation, makeMessage(), ACTOR_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send a notification when no recipient remains after excluding the sender', async () => {
    const adapter = makeAdapter();
    const conversation = new Conversation({
      id: 'conversation-id',
      creatorId: ACTOR_ID,
      participantIds: [ACTOR_ID, ACTOR_ID],
      isGroup: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await adapter.notifyNewMessage(conversation, makeMessage(), ACTOR_ID);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
