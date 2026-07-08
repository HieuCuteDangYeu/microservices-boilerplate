import { AuthController } from '@gateway/auth/auth.controller';
import { CallController } from '@gateway/calls/call.controller';
import { JwtAuthGuard } from '@gateway/auth/guards/jwt-auth.guard';
import { ContentController } from '@gateway/content/content.controller';
import { PublicReelShareController } from '@gateway/content/public-reel-share.controller';
import { ReelAuthorService } from '@gateway/content/reel-author.service';
import { ConversationController } from '@gateway/conversation/conversation.controller';
import { GatewayKeyController } from '@gateway/conversation/key.controller';
import { MessageController } from '@gateway/conversation/message.controller';
import { FriendController } from '@gateway/friends/friend.controller';
import { MediaController } from '@gateway/media/media.controller';
import { NotificationController } from '@gateway/notifications/notification.controller';
import { PaymentController } from '@gateway/payment/payment.controller';
import { SearchController } from '@gateway/search/search.controller';
import { UserController } from '@gateway/users/user.controller';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

function createRmqClientRegistration(name: string, queue: string) {
  return {
    name,
    useFactory: (configService: ConfigService) => {
      const heartbeat = Number(
        configService.get<string>('RABBITMQ_HEARTBEAT_SECONDS') ?? '300',
      );

      return {
        transport: Transport.RMQ as const,
        options: {
          urls: [
            configService.get<string>('RABBITMQ_URL') ||
              'amqp://localhost:5672',
          ],
          queue,
          queueOptions: { durable: true },
          heartbeat:
            Number.isFinite(heartbeat) && heartbeat > 0 ? heartbeat : 300,
          retryAttempts: 10,
          retryDelay: 3000,
        },
      };
    },
    inject: [ConfigService],
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ClientsModule.registerAsync([
      createRmqClientRegistration('USER_SERVICE', 'user_queue'),
      createRmqClientRegistration('AUTH_SERVICE', 'auth_queue'),
      createRmqClientRegistration('MEDIA_SERVICE', 'media_queue'),
      createRmqClientRegistration('PAYMENT_SERVICE', 'payment_queue'),
      createRmqClientRegistration('CONVERSATION_SERVICE', 'conversation_queue'),
      createRmqClientRegistration('CONTENT_SERVICE', 'content_queue'),
      createRmqClientRegistration('AI_SERVICE', 'ai_queue'),
      createRmqClientRegistration('FRIEND_SERVICE', 'friend_queue'),
      createRmqClientRegistration('CALL_SERVICE', 'call_queue'),
    ]),
  ],
  controllers: [
    UserController,
    AuthController,
    FriendController,
    MediaController,
    PaymentController,
    ConversationController,
    MessageController,
    GatewayKeyController,
    ContentController,
    PublicReelShareController,
    SearchController,
    NotificationController,
    CallController,
  ],
  providers: [JwtAuthGuard, ReelAuthorService],
})
export class ApiGatewayModule {}
