import { Socket } from 'socket.io';
import type { IChatRepository } from '../../domain/interfaces/chat.repository.interface';
import { ChatGateway } from './chat.gateway';

const CALLER_ID = '11111111-1111-4111-8111-111111111111';
const CALLEE_ID = '22222222-2222-4222-8222-222222222222';

const createGateway = () =>
  new ChatGateway(
    null as never,
    null as never,
    null as never,
    {} as IChatRepository,
    null as never,
    {} as never,
  );

describe('ChatGateway room namespace migration', () => {
  it.each(['offer', 'answer', 'ice_candidate'] as const)(
    'dual-targets legacy and namespaced user rooms for %s signaling',
    async (eventName) => {
      const gateway = createGateway();
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      const client = {
        id: 'socket-call',
        data: { userId: CALLER_ID },
        to,
      } as unknown as Socket;
      const payload = {
        toUserId: CALLEE_ID,
        sdp: 'signal-payload',
      };

      if (eventName === 'offer') {
        await gateway.handleOffer(payload, client);
      } else if (eventName === 'answer') {
        await gateway.handleAnswer(payload, client);
      } else {
        await gateway.handleIceCandidate(payload, client);
      }

      expect(to).toHaveBeenCalledWith([CALLEE_ID, `user:${CALLEE_ID}`]);
      expect(emit).toHaveBeenCalledWith(eventName, {
        ...payload,
        fromUserId: CALLER_ID,
      });
    },
  );
});
