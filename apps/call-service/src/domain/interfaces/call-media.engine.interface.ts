export interface CreateSendTransportResult {
  transportId: string;
  direction: 'send';
  iceParameters: Record<string, unknown>;
  iceCandidates: unknown[];
  dtlsParameters: Record<string, unknown>;
}

export interface CreateRecvTransportResult {
  transportId: string;
  direction: 'recv';
  iceParameters: Record<string, unknown>;
  iceCandidates: unknown[];
  dtlsParameters: Record<string, unknown>;
}

export interface ProducedMediaResult {
  producerId: string;
}

export interface ConsumedMediaResult {
  consumerId: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: Record<string, unknown>;
}

export abstract class ICallMediaEngine {
  abstract createRoom(roomId: string): Promise<void>;
  abstract createSendTransport(
    roomId: string,
    userId: string,
  ): Promise<CreateSendTransportResult>;
  abstract createRecvTransport(
    roomId: string,
    userId: string,
  ): Promise<CreateRecvTransportResult>;
  abstract connectTransport(
    roomId: string,
    userId: string,
    transportId: string,
    dtlsParameters: Record<string, unknown>,
  ): Promise<void>;
  abstract produce(
    roomId: string,
    userId: string,
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: Record<string, unknown>,
  ): Promise<ProducedMediaResult>;
  abstract consume(
    roomId: string,
    userId: string,
    producerId: string,
  ): Promise<ConsumedMediaResult>;
  abstract closeRoom(roomId: string): Promise<void>;
}
