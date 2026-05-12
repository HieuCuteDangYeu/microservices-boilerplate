import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as mediasoup from 'mediasoup';
import type {
  ConsumedMediaResult,
  CreateRecvTransportResult,
  CreateSendTransportResult,
  ICallMediaEngine,
  ProducedMediaResult,
} from '../../domain/interfaces/call-media.engine.interface';
import { RedisCallStateRepository } from '../repositories/redis-call-state.repository';

type MediaType = 'audio' | 'video';

type RoomRuntimeState = {
  roomId: string;
  worker: mediasoup.types.Worker;
  router: mediasoup.types.Router;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  transportMeta: Map<
    string,
    { roomId: string; userId: string; direction: 'send' | 'recv' }
  >;
  producers: Map<string, mediasoup.types.Producer>;
  producerMeta: Map<
    string,
    { roomId: string; userId: string; transportId: string; kind: MediaType }
  >;
  consumers: Map<string, mediasoup.types.Consumer>;
  consumerMeta: Map<
    string,
    { roomId: string; userId: string; transportId: string; producerId: string }
  >;
};

@Injectable()
export class MediasoupCallMediaEngine
  implements ICallMediaEngine, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MediasoupCallMediaEngine.name);
  private readonly rooms = new Map<string, RoomRuntimeState>();
  private readonly workers: mediasoup.types.Worker[] = [];
  private workerCursor = 0;
  private readonly workerCount = Math.max(
    1,
    Number(process.env.MEDIASOUP_WORKERS || 1),
  );

  constructor(private readonly stateRepository: RedisCallStateRepository) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrapWorkers(this.workerCount);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
  }

  async createRoom(roomId: string): Promise<void> {
    if (this.rooms.has(roomId)) return;

    const worker = await this.getNextWorker();
    const router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            'x-google-start-bitrate': 1000,
          },
        },
      ],
    });

    this.rooms.set(roomId, {
      roomId,
      worker,
      router,
      transports: new Map(),
      transportMeta: new Map(),
      producers: new Map(),
      producerMeta: new Map(),
      consumers: new Map(),
      consumerMeta: new Map(),
    });

    await this.stateRepository.saveRoom({
      roomId,
      workerId: String(worker.pid),
      routerId: router.id,
    });
  }

  async createSendTransport(
    roomId: string,
    userId: string,
  ): Promise<CreateSendTransportResult> {
    return this.createTransport(roomId, userId, 'send');
  }

  async createRecvTransport(
    roomId: string,
    userId: string,
  ): Promise<CreateRecvTransportResult> {
    return this.createTransport(roomId, userId, 'recv');
  }

  async connectTransport(
    roomId: string,
    userId: string,
    transportId: string,
    dtlsParameters: Record<string, unknown>,
  ): Promise<void> {
    const room = this.getRoomOrThrow(roomId);
    const transport = room.transports.get(transportId);
    const meta = room.transportMeta.get(transportId);

    if (!transport || !meta || meta.userId !== userId) {
      throw new Error('Transport not found');
    }

    await transport.connect({
      dtlsParameters: dtlsParameters as mediasoup.types.DtlsParameters,
    });
    room.transportMeta.set(transportId, { ...meta });

    await this.stateRepository.saveTransportState({
      transportId,
      roomId,
      userId,
      direction: meta.direction,
      connected: true,
    });
  }

  async produce(
    roomId: string,
    userId: string,
    transportId: string,
    kind: MediaType,
    rtpParameters: Record<string, unknown>,
  ): Promise<ProducedMediaResult> {
    const room = this.getRoomOrThrow(roomId);
    const transport = room.transports.get(transportId);
    const meta = room.transportMeta.get(transportId);

    if (
      !transport ||
      !meta ||
      meta.userId !== userId ||
      meta.roomId !== roomId
    ) {
      throw new Error('Transport is not connected');
    }

    const producer = await transport.produce({
      kind,
      rtpParameters: rtpParameters as mediasoup.types.RtpParameters,
      appData: {
        roomId,
        userId,
      },
    });

    room.producers.set(producer.id, producer);
    room.producerMeta.set(producer.id, {
      roomId,
      userId,
      transportId,
      kind,
    });

    producer.on('transportclose', () => {
      room.producers.delete(producer.id);
      room.producerMeta.delete(producer.id);
    });

    await this.stateRepository.saveProducerState({
      producerId: producer.id,
      transportId,
      roomId,
      userId,
      kind,
    });

    return { producerId: producer.id };
  }

  async consume(
    roomId: string,
    userId: string,
    producerId: string,
  ): Promise<ConsumedMediaResult> {
    const room = this.getRoomOrThrow(roomId);
    const producer = room.producers.get(producerId);

    if (!producer) {
      throw new Error('Producer not found');
    }

    const canConsume = room.router.canConsume({
      producerId,
      rtpCapabilities: room.router.rtpCapabilities,
    });

    if (!canConsume) {
      throw new Error('Cannot consume producer');
    }

    const recvTransport = await this.getOrCreateRecvTransport(
      room,
      roomId,
      userId,
    );
    const consumer = await recvTransport.consume({
      producerId,
      rtpCapabilities: room.router.rtpCapabilities,
      paused: true,
      appData: {
        roomId,
        userId,
      },
    });

    room.consumers.set(consumer.id, consumer);
    room.consumerMeta.set(consumer.id, {
      roomId,
      userId,
      transportId: recvTransport.id,
      producerId,
    });

    consumer.on('transportclose', () => {
      room.consumers.delete(consumer.id);
      room.consumerMeta.delete(consumer.id);
    });

    return {
      consumerId: consumer.id,
      producerId,
      kind: producer.kind as MediaType,
      rtpParameters: consumer.rtpParameters as Record<string, unknown>,
    };
  }

  async closeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.consumers.forEach((consumer) => consumer.close());
    room.producers.forEach((producer) => producer.close());
    room.transports.forEach((transport) => transport.close());
    room.router.close();
    this.rooms.delete(roomId);
    await this.stateRepository.removeRoom(roomId);
  }

  private async bootstrapWorkers(count: number): Promise<void> {
    if (this.workers.length > 0) return;

    for (let index = 0; index < count; index += 1) {
      const worker = await mediasoup.createWorker({
        rtcMinPort: Number(process.env.MEDIASOUP_RTC_MIN_PORT || 40000),
        rtcMaxPort: Number(process.env.MEDIASOUP_RTC_MAX_PORT || 49999),
        logLevel: 'warn',
        logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
      });

      worker.on('died', () => {
        this.logger.error(`Mediasoup worker died pid=${worker.pid}`);
        this.workers.splice(this.workers.indexOf(worker), 1);
      });

      this.workers.push(worker);
    }
  }

  private async getNextWorker(): Promise<mediasoup.types.Worker> {
    if (this.workers.length === 0) {
      await this.bootstrapWorkers(this.workerCount);
    }

    const worker = this.workers[this.workerCursor % this.workers.length];
    this.workerCursor = (this.workerCursor + 1) % this.workers.length;
    return worker;
  }

  private async createTransport(
    roomId: string,
    userId: string,
    direction: 'send' | 'recv',
  ): Promise<CreateSendTransportResult & CreateRecvTransportResult> {
    const room = this.getRoomOrThrow(roomId);

    const transport = await room.router.createWebRtcTransport({
      listenIps: [
        {
          ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
          announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 800000,
      appData: {
        roomId,
        userId,
        direction,
      },
    });

    room.transports.set(transport.id, transport);
    room.transportMeta.set(transport.id, { roomId, userId, direction });

    transport.on('dtlsstatechange', (state) => {
      if (state === 'closed') {
        transport.close();
      }
    });

    transport.on('transportclose', () => {
      room.transports.delete(transport.id);
      room.transportMeta.delete(transport.id);
    });

    await this.stateRepository.saveTransportState({
      transportId: transport.id,
      roomId,
      userId,
      direction,
      connected: false,
    });

    return {
      transportId: transport.id,
      direction,
      iceParameters: transport.iceParameters as Record<string, unknown>,
      iceCandidates: transport.iceCandidates as unknown[],
      dtlsParameters: transport.dtlsParameters as Record<string, unknown>,
    };
  }

  private async getOrCreateRecvTransport(
    room: RoomRuntimeState,
    roomId: string,
    userId: string,
  ): Promise<mediasoup.types.WebRtcTransport> {
    const existing = [...room.transports.values()].find((transport) => {
      const meta = room.transportMeta.get(transport.id);
      return (
        meta?.roomId === roomId &&
        meta?.userId === userId &&
        meta?.direction === 'recv'
      );
    });

    if (existing) return existing;

    const result = await this.createTransport(roomId, userId, 'recv');
    return room.transports.get(
      result.transportId,
    ) as mediasoup.types.WebRtcTransport;
  }

  private getRoomOrThrow(roomId: string): RoomRuntimeState {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }
    return room;
  }
}
