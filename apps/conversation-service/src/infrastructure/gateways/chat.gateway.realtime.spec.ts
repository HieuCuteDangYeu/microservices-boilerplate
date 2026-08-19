import { Server, Socket } from 'socket.io';
import { Conversation } from '../../domain/entities/conversation.entity';
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import { ChatGateway } from './chat.gateway';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '507f1f77bcf86cd799439011';

const conversation = () =>
  new Conversation({
    id: CONVERSATION_ID,
    creatorId: OWNER_ID,
    participantIds: [OWNER_ID, MEMBER_ID],
    isGroup: true,
    name: 'Realtime Group',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
  });

describe('ChatGateway realtime membership helpers', () => {
  let chatRepository: {
    assertConversationParticipant: jest.Mock;
    findPresenceAudienceUserIds: jest.Mock;
  };
  let redis: { del: jest.Mock };
  let gateway: ChatGateway;
  let emit: jest.Mock;
  let socketsLeave: jest.Mock;
  let fetchSockets: jest.Mock;
  let to: jest.Mock;
  let inRoom: jest.Mock;

  beforeEach(() => {
    chatRepository = {
      assertConversationParticipant: jest.fn().mockResolvedValue(undefined),
      findPresenceAudienceUserIds: jest.fn().mockResolvedValue([]),
    };
    redis = { del: jest.fn().mockResolvedValue(1) };

    gateway = new ChatGateway(
      null as never,
      null as never,
      null as never,
      chatRepository as unknown as IChatRepository,
      null as never,
      redis as never,
    );

    emit = jest.fn();
    socketsLeave = jest.fn();
    fetchSockets = jest.fn().mockResolvedValue([{}]);
    to = jest.fn().mockReturnValue({ emit });
    inRoom = jest.fn().mockReturnValue({ socketsLeave, fetchSockets });

    gateway.server = {
      to,
      in: inRoom,
    } as unknown as Server;
  });

  it('keeps the existing raw user room contract on connection', async () => {
    const client = {
      id: 'socket-1',
      data: { userId: OWNER_ID },
      join: jest.fn().mockResolvedValue(undefined),
    } as unknown as Socket;

    await gateway.handleConnection(client);

    expect(inRoom).toHaveBeenCalledWith(OWNER_ID);
    expect(client.join).toHaveBeenCalledWith(OWNER_ID);
    expect(redis.del).toHaveBeenCalled();
  });

  it('authorizes then joins the existing raw conversation room', async () => {
    const client = {
      id: 'socket-2',
      data: { userId: MEMBER_ID },
      join: jest.fn().mockResolvedValue(undefined),
    } as unknown as Socket;

    await gateway.handleJoinConversation(CONVERSATION_ID, client);

    expect(chatRepository.assertConversationParticipant).toHaveBeenCalledWith(
      CONVERSATION_ID,
      MEMBER_ID,
    );
    expect(client.join).toHaveBeenCalledWith(CONVERSATION_ID);
  });

  it('emits conversation updates to all account rooms in one fanout', () => {
    const group = conversation();

    gateway.emitConversationUpdated(group);

    expect(to).toHaveBeenCalledWith([OWNER_ID, MEMBER_ID]);
    expect(emit).toHaveBeenCalledWith(
      'conversation_updated',
      expect.objectContaining({
        id: CONVERSATION_ID,
        participantIds: [OWNER_ID, MEMBER_ID],
      }),
    );
  });

  it('can target conversation_created to only the newly-added member', () => {
    const group = conversation();

    gateway.emitConversationCreated(group, [MEMBER_ID]);

    expect(to).toHaveBeenCalledWith([MEMBER_ID]);
    expect(emit).toHaveBeenCalledWith(
      'conversation_created',
      expect.objectContaining({ id: CONVERSATION_ID }),
    );
  });

  it('notifies every device then removes the account from the conversation room', () => {
    gateway.evictConversationMember({
      conversationId: CONVERSATION_ID,
      userId: MEMBER_ID,
      reason: 'removed',
    });

    expect(to).toHaveBeenCalledWith([MEMBER_ID]);
    expect(emit).toHaveBeenCalledWith('conversation_removed', {
      conversationId: CONVERSATION_ID,
      reason: 'removed',
    });
    expect(inRoom).toHaveBeenCalledWith(MEMBER_ID);
    expect(socketsLeave).toHaveBeenCalledWith(CONVERSATION_ID);
  });

  it('does not disconnect the account when evicting it from one conversation', () => {
    const disconnectSockets = jest.fn();
    gateway.server = {
      to,
      in: inRoom,
      disconnectSockets,
    } as unknown as Server;

    gateway.evictConversationMember({
      conversationId: CONVERSATION_ID,
      userId: MEMBER_ID,
      reason: 'left',
    });

    expect(socketsLeave).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(disconnectSockets).not.toHaveBeenCalled();
  });
});
