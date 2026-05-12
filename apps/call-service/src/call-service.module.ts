import { Module } from '@nestjs/common'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { ConfigModule, ConfigService } from '@nestjs/config'

import { JoinRoomUseCase } from './application/use-cases/join-room.use-case'
import { CreateTransportUseCase } from './application/use-cases/create-transport.use-case'
import { ConnectTransportUseCase } from './application/use-cases/connect-transport.use-case'
import { ProduceUseCase } from './application/use-cases/produce.use-case'
import { ConsumeUseCase } from './application/use-cases/consume.use-case'
import { EndCallUseCase } from './application/use-cases/end-call.use-case'
import { RejectCallUseCase } from './application/use-cases/reject-call.use-case'
import { AnswerCallUseCase } from './application/use-cases/answer-call.use-case'
import { CallGateway } from './infrastructure/gateways/call.gateway'
import { RedisCallStateRepository } from './infrastructure/repositories/redis-call-state.repository'
import { RedisCallSessionRepository } from './infrastructure/repositories/redis-call-session.repository'
import { RabbitCallEventPublisher } from './infrastructure/publishers/rabbit-call-event.publisher'
import { MediasoupCallMediaEngine } from './infrastructure/engines/mediasoup-call.engine'
import { CallEventsSubscriber } from './infrastructure/subscribers/call-events.subscriber'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
      {
        name: 'CALL_SERVICE_RMQ',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.getOrThrow<string>('RABBITMQ_URL')],
            queue: 'call_queue',
            queueOptions: { durable: true },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [CallEventsSubscriber],
  providers: [
    CallGateway,
    JoinRoomUseCase,
    CreateTransportUseCase,
    ConnectTransportUseCase,
    ProduceUseCase,
    ConsumeUseCase,
    EndCallUseCase,
    RejectCallUseCase,
    AnswerCallUseCase,
    {
      provide: 'ICallSessionRepository',
      useClass: RedisCallSessionRepository,
    },
    {
      provide: 'ICallStateRepository',
      useClass: RedisCallStateRepository,
    },
    {
      provide: 'ICallEventPublisher',
      useClass: RabbitCallEventPublisher,
    },
    {
      provide: 'ICallMediaEngine',
      useClass: MediasoupCallMediaEngine,
    },
  ],
})
export class CallServiceModule {}
