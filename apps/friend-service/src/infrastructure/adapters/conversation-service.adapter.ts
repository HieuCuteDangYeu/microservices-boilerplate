import { isRpcError } from '@common/constants/rpc-error.types';
import type { IConversationService } from '@friend/domain/interfaces/conversation-service.interface';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, lastValueFrom, throwError, timeout } from 'rxjs';

@Injectable()
export class ConversationServiceAdapter implements IConversationService {
  private readonly logger = new Logger(ConversationServiceAdapter.name);

  constructor(
    @Inject('CONVERSATION_SERVICE_RMQ') private readonly client: ClientProxy,
  ) {}

  async createDirectConversation(
    userId: string,
    otherUserId: string,
  ): Promise<string> {
    const result = await lastValueFrom(
      this.client
        .send<{ id: string }>('create_conversation', {
          participantIds: [userId, otherUserId],
          isGroup: false,
          creatorId: userId,
        })
        .pipe(
          timeout(5000),
          catchError((err: unknown) => {
            const message = this.describeError(err);

            this.logger.error(
              `RPC Error [createDirectConversation]: ${message}`,
            );

            return throwError(() => new Error(message));
          }),
        ),
    );

    if (!result?.id) {
      throw new Error('Conversation service returned an invalid response');
    }

    return result.id;
  }

  private describeError(error: unknown): string {
    if (isRpcError(error)) {
      return Array.isArray(error.message)
        ? error.message.join(', ')
        : error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Failed to create conversation';
  }
}
