import type { ReelMediaJob } from '@common/processing/interfaces/reel-media-job.interface';
import { REEL_MEDIA_JOB_PATTERN } from '@common/processing/interfaces/reel-media-job.interface';
import {
  getReelMediaRetryQueue,
  REEL_MEDIA_DEAD_LETTER_EXCHANGE,
  REEL_MEDIA_DEAD_LETTER_QUEUES,
  REEL_MEDIA_EXCHANGE,
  REEL_MEDIA_PRIMARY_QUEUES,
  REEL_MEDIA_RETRY_QUEUES,
} from '@common/processing/reel-media-queue.constants';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IReelMediaRetryPublisher } from '@processing/domain/interfaces/reel-media-retry-publisher.interface';
import type {
  AmqpConnectionManager,
  Channel,
  ChannelWrapper,
} from 'amqp-connection-manager';
import { connect } from 'amqp-connection-manager';

@Injectable()
export class ReelMediaRetryPublisherAdapter
  implements IReelMediaRetryPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ReelMediaRetryPublisherAdapter.name);
  private connection?: AmqpConnectionManager;
  private channel?: ChannelWrapper;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const heartbeat = this.getPositiveInteger(
      'RABBITMQ_HEARTBEAT_SECONDS',
      300,
    );
    this.connection = connect(
      [
        this.configService.get<string>('RABBITMQ_URL') ||
          'amqp://localhost:5672',
      ],
      { heartbeatIntervalInSeconds: heartbeat },
    );
    this.connection.on('connectFailed', ({ err }) => {
      this.logger.error(`RabbitMQ connection failed: ${err.message}`);
    });
    this.channel = this.connection.createChannel({
      name: 'processing-reel-media-retry-publisher',
      setup: (channel: Channel) => this.assertTopology(channel),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  async publishRetry(job: ReelMediaJob, retryNumber: 1 | 2): Promise<void> {
    if (!this.channel) {
      throw new Error('Reel media retry publisher is not initialized');
    }

    const definition = getReelMediaRetryQueue(
      job.expectedLengthClass,
      retryNumber,
    );
    const packet = Buffer.from(
      JSON.stringify({ pattern: REEL_MEDIA_JOB_PATTERN, data: job }),
    );

    await this.channel.sendToQueue(definition.queue, packet, {
      persistent: true,
      contentType: 'application/json',
      messageId: job.jobId,
      type: REEL_MEDIA_JOB_PATTERN,
      timestamp: Date.now(),
      headers: {
        'x-reel-retry-count': retryNumber,
      },
    });
  }

  private async assertTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(REEL_MEDIA_EXCHANGE, 'direct', {
      durable: true,
    });
    await channel.assertExchange(REEL_MEDIA_DEAD_LETTER_EXCHANGE, 'direct', {
      durable: true,
    });

    for (const definition of REEL_MEDIA_PRIMARY_QUEUES) {
      await channel.assertQueue(definition.queue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': REEL_MEDIA_DEAD_LETTER_EXCHANGE,
          'x-dead-letter-routing-key': definition.deadLetterRoutingKey,
        },
      });
      await channel.bindQueue(
        definition.queue,
        REEL_MEDIA_EXCHANGE,
        definition.routingKey,
      );
    }

    for (const definition of REEL_MEDIA_RETRY_QUEUES) {
      await channel.assertQueue(definition.queue, {
        durable: true,
        arguments: {
          'x-message-ttl': definition.delayMs,
          'x-dead-letter-exchange': REEL_MEDIA_EXCHANGE,
          'x-dead-letter-routing-key': definition.returnRoutingKey,
        },
      });
    }

    for (const definition of REEL_MEDIA_DEAD_LETTER_QUEUES) {
      await channel.assertQueue(definition.queue, { durable: true });
      await channel.bindQueue(
        definition.queue,
        REEL_MEDIA_DEAD_LETTER_EXCHANGE,
        definition.routingKey,
      );
    }
  }

  private getPositiveInteger(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);

    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
